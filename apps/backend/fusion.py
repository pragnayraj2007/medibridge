"""Data fusion: one normalised patient context from every source, before the summary.

Pure Python, no AI. Sources are kept side by side with their provenance and
never silently merged: when two sources disagree the disagreement is recorded
in `conflicts` and passed to the summary model, which must state both.

Sources: patient profile, current conversation (typed and voice), AI
extraction of the conversation, uploaded documents (OCR text + Gemini
findings), previous cases, vitals.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

MAX_PREVIOUS = 5
OCR_EXCERPT = 1200


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", str(text).lower()).strip()


def _words(text: str) -> set[str]:
    return {w for w in _norm(text).split() if len(w) > 2}


def _same_item(a: str, b: str) -> bool:
    """Loose match for symptoms / medicines ("chest pain" ~ "pain in chest")."""
    wa, wb = _words(a), _words(b)
    if not wa or not wb:
        return False
    return wa <= wb or wb <= wa or len(wa & wb) / min(len(wa), len(wb)) >= 0.6


def _missing(items: list[str], reference: list[str]) -> list[str]:
    return [i for i in items if not any(_same_item(i, r) for r in reference)]


def _parse(ts) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def build_context(profile: dict, intake_patient: dict, extraction: dict, messages: list[dict],
                  documents: list[dict], previous_cases: list[dict], vitals: dict | None,
                  now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    findings_by_doc = [(d, (d.get("analysis") or {}).get("findings") or {}) for d in documents]

    context = {
        "patient": {
            "patient_code": profile.get("patient_code"),
            "name": profile.get("name"),
            "age": intake_patient.get("age", profile.get("age")),
            "sex": intake_patient.get("sex") or profile.get("sex"),
        },
        "current": {
            "source": f"patient conversation ({extraction.get('source', 'rules')} extraction)",
            "symptoms": extraction.get("symptoms", []),
            "duration": extraction.get("duration"),
            "severity": extraction.get("severity"),
            "history": extraction.get("history", []),
            "medications": extraction.get("medications", []),
            "allergies": extraction.get("allergies", []),
        },
        "voice_transcripts": [m["text"] for m in messages if m.get("role") == "patient" and m.get("via") == "voice"],
        "vitals": {k: v for k, v in (vitals or {}).items() if v is not None} or None,
        "documents": [
            {
                "id": d.get("id"),
                "name": d.get("name"),
                "doc_type": d.get("doc_type"),
                "status": d.get("status"),
                "ocr_status": (d.get("ocr") or {}).get("status"),
                "ocr_excerpt": ((d.get("ocr") or {}).get("text") or "")[:OCR_EXCERPT] or None,
                "analysis_status": (d.get("analysis") or {}).get("status"),
                "findings": f or None,
            }
            for d, f in findings_by_doc
        ],
        "previous_cases": [
            {
                "case_id": c.get("id"),
                "date": c.get("created_at"),
                "triage_level": c.get("triage_level"),
                "symptoms": (c.get("extraction") or {}).get("symptoms", []),
                "duration": (c.get("extraction") or {}).get("duration"),
                "summary": (c.get("summary") or "")[:400] or None,
            }
            for c in previous_cases[:MAX_PREVIOUS]
        ],
    }
    context["conflicts"] = find_conflicts(context, findings_by_doc, now)
    used = ["profile", "conversation"]
    if context["voice_transcripts"]:
        used.append("voice")
    if context["documents"]:
        used.append("documents")
        if any(d["ocr_status"] == "done" for d in context["documents"]):
            used.append("ocr")
        if any(d["analysis_status"] == "done" for d in context["documents"]):
            used.append("gemini")
    if context["previous_cases"]:
        used.append("previous_cases")
    if context["vitals"]:
        used.append("vitals")
    context["sources"] = used
    return context


def find_conflicts(ctx: dict, findings_by_doc: list[tuple[dict, dict]], now: datetime) -> list[dict]:
    """Deterministic cross-source checks. kind = "conflict" (sources disagree) or
    "unconfirmed" (stated by one source, absent from the patient's own account)."""
    out: list[dict] = []
    cur = ctx["current"]

    # Age: profile vs documents
    age = ctx["patient"]["age"]
    for doc, f in findings_by_doc:
        doc_age = f.get("patient_age")
        if isinstance(doc_age, (int, float)) and age is not None and abs(doc_age - age) > 1:
            out.append({"field": "age", "kind": "conflict",
                        "statements": [{"source": "patient", "value": str(age)},
                                       {"source": f"document: {doc.get('name')}", "value": str(int(doc_age))}]})

    # Medicines / allergies / conditions found in documents but not mentioned by the patient
    for field, doc_key in (("medications", "medications"), ("allergies", "allergies"), ("history", "diagnoses_mentioned")):
        for doc, f in findings_by_doc:
            extra = _missing([str(x) for x in (f.get(doc_key) or [])], cur[field])
            if extra:
                out.append({"field": field, "kind": "unconfirmed",
                            "statements": [{"source": f"document: {doc.get('name')}", "value": ", ".join(extra[:8])},
                                           {"source": "patient", "value": ", ".join(cur[field]) or "not mentioned"}]})

    # Timeline: the same symptom in a recent previous case with a different duration / onset
    for prev in ctx["previous_cases"]:
        when = _parse(prev.get("date"))
        if not when or now - when > timedelta(days=30):
            continue
        shared = [s for s in cur["symptoms"] if any(_same_item(s, p) for p in prev.get("symptoms", []))]
        if not shared:
            continue
        days_ago = max(0, (now - when).days)
        out.append({"field": "timeline", "kind": "conflict" if cur.get("duration") else "unconfirmed",
                    "statements": [
                        {"source": "patient today", "value": f"{', '.join(shared)}; duration: {cur.get('duration') or 'not stated'}"},
                        {"source": f"previous case {str(prev.get('case_id', ''))[:8].upper()} ({days_ago} day(s) ago)",
                         "value": f"{', '.join(prev.get('symptoms', []))}; duration then: {prev.get('duration') or 'not stated'}"},
                    ]})
    return out


def document_flags(documents: list[dict], vocabulary: dict) -> dict[str, list[str]]:
    """Danger-sign flags that Gemini found in documents (Safety Engine vocabulary only).
    Returns {flag: [document names]}. They are candidates: the Safety Engine decides."""
    found: dict[str, list[str]] = {}
    for d in documents:
        f = (d.get("analysis") or {}).get("findings") or {}
        for flag in f.get("danger_signs") or []:
            if flag in vocabulary:
                found.setdefault(flag, []).append(d.get("name") or "document")
    return found
