"""Business logic behind the API routes (no FastAPI imports, so it is unit-testable).

End-to-end flow for a submitted intake (create_case):
  patient + conversation + voice + documents + previous cases + vitals
  -> AI extraction (Groq; facts only)
  -> data fusion (fusion.py; conflicts kept)
  -> Safety Engine (deterministic; final RED / YELLOW / GREEN)
  -> doctor summary (Groq, from the fused context; never sets urgency)
  -> case stored
  -> scheduling (scheduling.py; priority, availability, distance, time)
  -> appointment stored (a unique index stops double booking; we retry)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import ai
import documents as docs_pipeline
import fusion
import scheduling
from auth import hash_patient_token, new_patient_code, new_patient_token
from keywords import find_flags, mentions_pregnancy
from qr import qr_data_uri
from safety_engine import VOCABULARY, TriageInput, TriageResult, Vitals, triage
from seed import DEMO_PATIENT_LAT, DEMO_PATIENT_LNG, DEMO_STATE
from storage import Conflict

# Patient-facing guidance per urgency class. Not a diagnosis.
GUIDANCE = {
    "RED": "Your answers include signs that need urgent attention. Please tell the reception or nursing staff "
           "right now. If you are not at a hospital, go to the nearest emergency department or call 108 / 112.",
    "YELLOW": "A doctor will see you as a priority. Please stay nearby and tell staff straight away if you feel worse.",
    "GREEN": "Your information has been sent to the doctor. You will be seen in turn. Tell staff if anything gets worse.",
}

ACTIVE = list(scheduling.ACTIVE_STATUSES)
TRANSITIONS = {
    "scheduled": {"confirmed", "cancelled"},
    "confirmed": {"in_progress", "cancelled"},
    "in_progress": {"completed"},
    "completed": set(),
    "cancelled": set(),
}


class NotFound(Exception):
    pass


class Invalid(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


def case_code(case_id: str) -> str:
    return "CASE-" + str(case_id)[:8].upper()


# ── Patients ────────────────────────────────────────────────────────────────

def public_patient(row: dict, with_qr: bool = False) -> dict:
    p = {k: row.get(k) for k in ("id", "patient_code", "name", "phone", "age", "sex", "pregnancy_status",
                                 "language", "created_at", "updated_at")}
    if with_qr:
        p["qr"] = qr_data_uri(row["patient_code"])
    return p


def register_patient(store, data: dict) -> tuple[dict, str]:
    token = new_patient_token()
    for _ in range(5):
        try:
            row = store.insert("patients", {**data, "patient_code": new_patient_code(),
                                            "token_hash": hash_patient_token(token)})
            return public_patient(row, with_qr=True), token
        except Conflict:
            continue  # patient code collision: try another
    raise Invalid("Could not create a patient ID, please try again.")


def find_patient(store, code: str) -> dict | None:
    rows = store.select("patients", {"patient_code": ("eq", code.strip().upper())}, limit=1)
    return rows[0] if rows else None


def update_patient(store, patient: dict, fields: dict) -> dict:
    fields = {k: v for k, v in fields.items() if v is not None}
    row = store.update("patients", patient["id"], fields) if fields else patient
    return public_patient(row, with_qr=True)


def _appointments_for(store, filters: dict) -> list[dict]:
    rows = store.select("appointments", filters, order="scheduled_at", desc=True)
    doctors = {d["id"]: d for d in store.select("doctors")}
    return [enrich_appointment(a, doctors) for a in rows]


def patient_appointments(store, patient: dict) -> list[dict]:
    return _appointments_for(store, {"patient_id": ("eq", patient["id"])})


def patient_cases(store, patient: dict) -> list[dict]:
    """Patient-facing history: no AI summary, no fused context."""
    cases = store.select("cases", {"patient_id": ("eq", patient["id"])}, order="created_at", desc=True, limit=50)
    appts = _latest_by_case(_appointments_for(store, {"patient_id": ("eq", patient["id"])}))
    return [patient_view(c, appts.get(c["id"])) for c in cases]


def patient_view(c: dict, appointment: dict | None) -> dict:
    return {
        "id": c["id"],
        "case_code": case_code(c["id"]),
        "created_at": c["created_at"],
        "status": c["status"],
        "triage_level": c["triage_level"],
        "reasons": [r.get("label") for r in (c.get("triage") or {}).get("reasons", [])],
        "symptoms": (c.get("extraction") or {}).get("symptoms", []),
        "your_answers": [m["text"] for m in c.get("messages") or [] if m.get("role") == "patient"],
        "documents": [d.get("name") for d in c.get("documents") or []],
        "guidance": GUIDANCE[c["triage_level"]],
        "appointment": appointment,
    }


def patient_case(store, patient: dict, case_id: str) -> dict:
    if not valid_uuid(case_id):
        raise NotFound()
    rows = store.select("cases", {"id": ("eq", case_id), "patient_id": ("eq", patient["id"])}, limit=1)
    if not rows:
        raise NotFound()
    appts = _latest_by_case(_appointments_for(store, {"case_id": ("eq", case_id)}))
    return patient_view(rows[0], appts.get(case_id))


def patient_documents(store, patient: dict) -> list[dict]:
    rows = store.select("documents", {"patient_id": ("eq", patient["id"])}, order="created_at", desc=True, limit=50)
    return [public_document(d) for d in rows]


# ── Documents ───────────────────────────────────────────────────────────────

def public_document(d: dict) -> dict:
    findings = (d.get("analysis") or {}).get("findings") or {}
    return {
        "id": d["id"], "name": d["name"], "doc_type": d.get("doc_type"), "mime_type": d.get("mime_type"),
        "size_bytes": d.get("size_bytes"), "status": d.get("status"), "case_id": d.get("case_id"),
        "created_at": d.get("created_at"),
        "ocr_status": (d.get("ocr") or {}).get("status"),
        "analysis_status": (d.get("analysis") or {}).get("status"),
        "analysis_error": (d.get("analysis") or {}).get("error"),
        "ocr_error": (d.get("ocr") or {}).get("error"),
        "summary": findings.get("summary") or None,
        "message": docs_pipeline.PATIENT_MESSAGE.get(d.get("status"), ""),
    }


def upload_document(store, patient: dict, data: bytes, filename: str, declared: str | None, doc_type: str | None) -> dict:
    mime = docs_pipeline.validate(data, declared)  # raises DocumentError
    result = docs_pipeline.process(data, mime, doc_type)
    doc_id = str(uuid.uuid4())
    ext = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[mime]
    path = f"{patient['patient_code']}/{doc_id}.{ext}"
    stored = docs_pipeline.store_file(path, data, mime)
    row = store.insert("documents", {
        "id": doc_id, "patient_id": patient["id"], "name": (filename or f"document.{ext}")[:200],
        "mime_type": mime, "size_bytes": len(data), "doc_type": (doc_type or None),
        "status": result["status"], "ocr": result["ocr"], "analysis": result["analysis"],
        "storage_path": path if stored else None,
    })
    return public_document(row)


# ── Safety Engine ───────────────────────────────────────────────────────────

def run_safety(patient, messages, vitals=None, llm_flags=(), document_flags=(), profile_pregnant=False
               ) -> tuple[TriageResult, list[str], bool]:
    """Keyword flags ∪ AI flags ∪ document flags -> deterministic Safety Engine.
    Other sources can only add flags; nothing can remove a keyword flag."""
    text = "\n".join(m.text for m in messages if m.role == "patient")
    keyword_flags = find_flags(text)
    pregnant = bool(patient.pregnant) or profile_pregnant or mentions_pregnancy(text)
    result = triage(TriageInput(
        flags=keyword_flags | set(llm_flags) | set(document_flags),
        age=patient.age,
        pregnant=pregnant,
        vitals=Vitals(**vitals.model_dump()) if vitals else Vitals(),
    ))
    return result, sorted(keyword_flags), pregnant


# ── Cases ───────────────────────────────────────────────────────────────────

def create_case(store, body, patient: dict | None, now: datetime | None = None) -> dict:
    now = now or _now()
    intake = body.patient
    if patient:  # the stored profile is the source of truth for identity fields
        intake = intake.model_copy(update={
            "name": patient.get("name") or intake.name,
            "age": patient.get("age") if patient.get("age") is not None else intake.age,
            "sex": patient.get("sex") or intake.sex,
            "phone": patient.get("phone") or intake.phone,
        })
    messages = [m.model_dump() for m in body.messages]

    docs: list[dict] = []
    previous: list[dict] = []
    if patient:
        ids = [i for i in body.document_ids if valid_uuid(i)]
        if ids:
            docs = store.select("documents", {"id": ("in", ids), "patient_id": ("eq", patient["id"])})
        previous = store.select("cases", {"patient_id": ("eq", patient["id"])}, order="created_at", desc=True, limit=5)

    extraction = ai.extract(intake, body.messages)
    doc_flags = fusion.document_flags(docs, VOCABULARY)
    profile_pregnant = bool(patient and patient.get("pregnancy_status") == "pregnant")
    result, keyword_flags, pregnant = run_safety(intake, body.messages, body.vitals, extraction["llm_flags"],
                                                 doc_flags.keys(), profile_pregnant)
    extraction["keyword_flags"] = keyword_flags
    extraction["document_flags"] = doc_flags

    intake_patient = {**intake.model_dump(), "pregnant": pregnant}
    context = fusion.build_context(patient or {}, intake_patient, extraction, messages, docs, previous,
                                   body.vitals.model_dump() if body.vitals else None, now)
    summary, summary_source = ai.summarize(context)
    extraction["summary_source"] = summary_source

    tri = result.to_dict()
    tri["decided_by"] = "safety_engine"
    tri["inputs"] = {
        "keyword_flags": keyword_flags,
        "ai_flags": extraction["llm_flags"],
        "document_flags": doc_flags,
        "age": intake.age,
        "pregnant": pregnant,
        "vitals": bool(body.vitals),
    }
    row = store.insert("cases", {
        "status": "new",
        "triage_level": result.level,
        "language": body.language,
        "patient_id": patient["id"] if patient else None,
        "patient": intake_patient,
        "messages": messages,
        "documents": [{"id": d["id"], "name": d["name"], "type": d.get("doc_type")} for d in docs]
                     + [d.model_dump() for d in body.documents],
        "vitals": body.vitals.model_dump() if body.vitals else None,
        "extraction": extraction,
        "summary": summary,
        "triage": tri,
        "fused_context": context,
    })
    for d in docs:
        store.update("documents", d["id"], {"case_id": row["id"]})

    appointment, appointment_error = None, None
    if patient:
        try:
            appointment, appointment_error = book(store, row, patient, now)
        except Exception as e:  # the case is saved; never pretend the booking worked
            appointment_error = "booking_failed"
            import logging
            logging.getLogger("medibridge").warning("Appointment booking failed: %s", e)
    else:
        appointment_error = "no_patient_id"

    return {**row, "case_code": case_code(row["id"]), "patient_code": patient["patient_code"] if patient else None,
            "appointment": appointment, "appointment_error": appointment_error,
            "guidance": GUIDANCE[result.level]}


def _latest_by_case(appointments: list[dict]) -> dict[str, dict]:
    """Per case: the latest non-cancelled appointment, else the latest one."""
    out: dict[str, dict] = {}
    for a in sorted(appointments, key=lambda a: (a["status"] != "cancelled", a.get("created_at") or "")):
        if a.get("case_id"):
            out[a["case_id"]] = a
    return out


def enrich_appointment(a: dict, doctors: dict[str, dict]) -> dict:
    d = doctors.get(a.get("doctor_id")) or {}
    return {**a, "doctor": {"id": d.get("id"), "name": d.get("name"), "specialization": d.get("specialization")} if d else None,
            "priority_label": scheduling.PRIORITY_LABEL.get(a.get("triage_level"), "")}


def list_cases(store, triage_level: str | None, status: str | None, limit: int) -> list[dict]:
    filters = {}
    if triage_level:
        filters["triage_level"] = ("eq", triage_level)
    if status:
        filters["status"] = ("eq", status)
    cases = store.select("cases", filters, order="created_at", desc=True, limit=limit)
    if not cases:
        return []
    ids = [c["id"] for c in cases]
    appts = _latest_by_case(_appointments_for(store, {"case_id": ("in", ids)}))
    pids = sorted({c["patient_id"] for c in cases if c.get("patient_id")})
    patients = {p["id"]: p for p in store.select("patients", {"id": ("in", pids)})} if pids else {}
    out = []
    for c in cases:
        c = {k: v for k, v in c.items() if k != "fused_context"}  # keep the list light
        p = patients.get(c.get("patient_id"))
        out.append({**c, "case_code": case_code(c["id"]), "patient_code": p["patient_code"] if p else None,
                    "appointment": appts.get(c["id"])})
    return out


def get_case(store, case_id: str) -> dict:
    if not valid_uuid(case_id):
        raise NotFound()
    rows = store.select("cases", {"id": ("eq", case_id)}, limit=1)
    if not rows:
        raise NotFound()
    c = rows[0]
    appts = _appointments_for(store, {"case_id": ("eq", case_id)})
    patient, previous = None, []
    if c.get("patient_id"):
        prow = store.select("patients", {"id": ("eq", c["patient_id"])}, limit=1)
        patient = public_patient(prow[0]) if prow else None
        prev_rows = store.select("cases", {"patient_id": ("eq", c["patient_id"])}, order="created_at", desc=True, limit=11)
        prev_appts = _latest_by_case(_appointments_for(store, {"patient_id": ("eq", c["patient_id"])}))
        previous = [{"id": p["id"], "case_code": case_code(p["id"]), "created_at": p["created_at"],
                     "triage_level": p["triage_level"], "status": p["status"],
                     "symptoms": (p.get("extraction") or {}).get("symptoms", []),
                     "summary": p.get("summary"), "appointment": prev_appts.get(p["id"])}
                    for p in prev_rows if p["id"] != case_id][:10]
    doc_rows = store.select("documents", {"case_id": ("eq", case_id)}, order="created_at")
    documents = [{**public_document(d), "findings": (d.get("analysis") or {}).get("findings"),
                  "ocr_text": ((d.get("ocr") or {}).get("text") or "")[:3000] or None,
                  "has_file": bool(d.get("storage_path"))} for d in doc_rows]
    return {**c, "case_code": case_code(c["id"]), "patient_code": patient["patient_code"] if patient else None,
            "patient_profile": patient, "appointment": _latest_by_case(appts).get(case_id),
            "appointments": appts, "previous_cases": previous, "document_details": documents}


def update_case_status(store, case_id: str, status: str) -> dict:
    if not valid_uuid(case_id) or store.update("cases", case_id, {"status": status}) is None:
        raise NotFound()
    return get_case(store, case_id)


# ── Doctors, scheduling, appointments ──────────────────────────────────────

def public_doctor(d: dict) -> dict:
    return {k: d.get(k) for k in ("id", "name", "specialization", "email", "latitude", "longitude",
                                  "availability_status", "next_available_at", "slot_minutes", "updated_at")}


def list_doctors(store, now: datetime | None = None) -> list[dict]:
    now = now or _now()
    doctors = store.select("doctors", order="name")
    appts = store.select("appointments", {"status": ("in", ACTIVE), "scheduled_at": ("gte", (now - timedelta(days=1)).isoformat())})
    decision = scheduling.plan("RED", doctors, appts, now, DEMO_PATIENT_LAT, DEMO_PATIENT_LNG)
    by_id = {c["doctor_id"]: c for c in decision["candidates"]}
    upcoming = {}
    for a in appts:
        if scheduling.parse_dt(a["scheduled_at"]) >= now - timedelta(minutes=30):
            upcoming[a["doctor_id"]] = upcoming.get(a["doctor_id"], 0) + 1
    return [{**public_doctor(d), "distance_km": by_id[d["id"]]["distance_km"], "next_free_slot": by_id[d["id"]]["slot"],
             "upcoming_appointments": upcoming.get(d["id"], 0)} for d in doctors]


def set_availability(store, doctor_id: str, status: str, busy_minutes: int | None, now: datetime | None = None) -> dict:
    now = now or _now()
    if not valid_uuid(doctor_id):
        raise NotFound()
    next_at = (now + timedelta(minutes=busy_minutes or 60)).isoformat() if status == "busy" else None
    row = store.update("doctors", doctor_id, {"availability_status": status, "next_available_at": next_at})
    if row is None:
        raise NotFound()
    return public_doctor(row)


def reset_demo(store, cancel_upcoming: bool, now: datetime | None = None) -> dict:
    now = now or _now()
    for doctor_id, (status, minutes) in DEMO_STATE.items():
        store.update("doctors", doctor_id, {"availability_status": status,
                                            "next_available_at": (now + timedelta(minutes=minutes)).isoformat()})
    cancelled = 0
    if cancel_upcoming:
        for a in store.select("appointments", {"status": ("in", ["scheduled", "confirmed"]), "scheduled_at": ("gte", now.isoformat())}):
            store.update("appointments", a["id"], {"status": "cancelled"})
            cancelled += 1
    return {"doctors": list_doctors(store, now), "cancelled_appointments": cancelled}


def book(store, case_row: dict, patient: dict, now: datetime, preferred_at: datetime | None = None
         ) -> tuple[dict | None, str | None]:
    level = case_row["triage_level"]
    lat = patient.get("latitude") if patient.get("latitude") is not None else DEMO_PATIENT_LAT
    lng = patient.get("longitude") if patient.get("longitude") is not None else DEMO_PATIENT_LNG
    exclude: set[tuple[str, str]] = set()
    for _ in range(3):
        doctors = store.select("doctors")
        appts = store.select("appointments", {"status": ("in", ACTIVE),
                                              "scheduled_at": ("gte", (now - timedelta(days=1)).isoformat())})
        decision = scheduling.plan(level, doctors, appts, now, lat, lng, preferred_at, exclude)
        chosen = decision["chosen"]
        if not chosen:
            return None, "no_doctor_available"
        doctor = next(d for d in doctors if d["id"] == chosen["doctor_id"])
        try:
            appt = store.insert("appointments", {
                "patient_id": patient["id"],
                "doctor_id": chosen["doctor_id"],
                "case_id": case_row["id"],
                "scheduled_at": chosen["slot"],
                "duration_minutes": int(doctor.get("slot_minutes") or 15),
                "triage_level": level,
                "priority": decision["priority"],
                "status": "confirmed" if level == "RED" else "scheduled",
                "distance_km": chosen["distance_km"],
                "assignment_reason": decision["reason"],
                "assignment": {"rule": decision["rule"], "candidates": decision["candidates"],
                               "decided_at": now.isoformat(), "preferred_at": preferred_at.isoformat() if preferred_at else None},
                "requested_at": now.isoformat(),
            })
            return enrich_appointment(appt, {d["id"]: d for d in doctors}), None
        except Conflict:
            exclude.add((chosen["doctor_id"], chosen["slot"]))  # someone took it a moment ago
    return None, "slot_conflict"


def get_appointment(store, appointment_id: str) -> dict:
    if not valid_uuid(appointment_id):
        raise NotFound()
    rows = _appointments_for(store, {"id": ("eq", appointment_id)})
    if not rows:
        raise NotFound()
    return rows[0]


def list_appointments(store, active_only: bool, doctor_id: str | None = None) -> list[dict]:
    filters: dict = {}
    if active_only:
        filters["status"] = ("in", ACTIVE)
    if doctor_id:
        filters["doctor_id"] = ("eq", doctor_id)
    rows = _appointments_for(store, filters)
    return sorted(rows, key=lambda a: (a["priority"], a["scheduled_at"]))


def set_appointment_status(store, appointment_id: str, status: str) -> dict:
    current = get_appointment(store, appointment_id)
    if status != current["status"] and status not in TRANSITIONS[current["status"]]:
        raise Invalid(f"Cannot change an appointment from {current['status']} to {status}.")
    store.update("appointments", appointment_id, {"status": status})
    return get_appointment(store, appointment_id)


def rebook_routine(store, patient: dict, case_id: str, preferred_at: datetime | None, now: datetime | None = None) -> dict:
    """Patient picks a later time for a GREEN case. Urgent cases stay on the automatic slot."""
    now = now or _now()
    if not valid_uuid(case_id):
        raise NotFound()
    rows = store.select("cases", {"id": ("eq", case_id), "patient_id": ("eq", patient["id"])}, limit=1)
    if not rows:
        raise NotFound()
    case_row = rows[0]
    if case_row["triage_level"] != "GREEN":
        raise Invalid("Urgent and priority appointments are scheduled automatically for the earliest time.")
    old = [a for a in store.select("appointments", {"case_id": ("eq", case_id), "status": ("in", ["scheduled", "confirmed"])})]
    appt, err = book(store, case_row, patient, now, preferred_at)
    if not appt:
        raise Invalid("No appointment is available at that time. Please choose another time.")
    for a in old:
        store.update("appointments", a["id"], {"status": "cancelled"})
    return appt
