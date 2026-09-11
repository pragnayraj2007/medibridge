import base64
import binascii
import logging
import os
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

import ai  # noqa: E402  (reads env at call time, after load_dotenv)
import documents as docs_pipeline  # noqa: E402
import service  # noqa: E402
import voice  # noqa: E402
from auth import issue_token, patient_token_matches, verify_password, verify_token  # noqa: E402
from models import (  # noqa: E402
    AppointmentRequest, AppointmentStatusUpdate, AudioIn, AvailabilityUpdate, CaseCreate, DemoReset, DocumentIn,
    LoginIn, NextQuestionIn, PatientRegister, PatientUpdate, SpeakIn, StatusUpdate,
)
from service import GUIDANCE, run_safety  # noqa: E402
from storage import StorageError, get_store  # noqa: E402

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="MediBridge API", version="0.3.0")

_default_origins = "http://localhost:3000,http://localhost:3001,http://localhost:8081"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = get_store()


@app.exception_handler(StorageError)
def storage_error(_, exc: StorageError):
    logging.getLogger("medibridge").error("Storage error: %s", exc)
    return JSONResponse(status_code=503, content={"detail": "The database is not reachable right now. Nothing was saved. Please try again."})


@app.exception_handler(service.NotFound)
def not_found(_, __):
    return JSONResponse(status_code=404, content={"detail": "Not found"})


@app.exception_handler(service.Invalid)
def invalid(_, exc: service.Invalid):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


# ── Auth dependencies ───────────────────────────────────────────────────────

def doctor_auth(authorization: Optional[str] = Header(None)) -> dict:
    token = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None
    payload = verify_token(token)
    if not payload:
        raise HTTPException(401, "Please sign in as a doctor.")
    return payload


def optional_doctor(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    token = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None
    return verify_token(token)


def current_patient(x_patient_code: Optional[str] = Header(None), x_patient_token: Optional[str] = Header(None)) -> dict:
    patient = service.find_patient(store, x_patient_code) if x_patient_code else None
    if not patient or not patient_token_matches(x_patient_token, patient.get("token_hash")):
        raise HTTPException(401, "This device is not registered for that patient ID.")
    return patient


def patient_by_code(code: str, x_patient_token: Optional[str] = Header(None),
                    doctor: Optional[dict] = Depends(optional_doctor)) -> dict:
    """The patient's own device (token) or any signed-in doctor. The code alone is never enough."""
    patient = service.find_patient(store, code)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if doctor or patient_token_matches(x_patient_token, patient.get("token_hash")):
        return patient
    raise HTTPException(401, "This device is not registered for that patient ID.")


# ── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "storage": store.name,
        "ai": "groq" if ai.ai_enabled() else "rules",
        "voice": "sarvam" if voice.enabled() else "off",
        "documents": {
            "ocr": "paddleocr" if os.getenv("PADDLEOCR_URL") else "off",
            "multimodal": "gemini" if os.getenv("GEMINI_API_KEY") else "off",
        },
    }


# ── Patients ────────────────────────────────────────────────────────────────

@app.post("/patients", status_code=201)
def register_patient(body: PatientRegister):
    patient, token = service.register_patient(store, body.model_dump())
    return {"patient": patient, "token": token}


@app.get("/patients/{code}")
def get_patient(patient: dict = Depends(patient_by_code)):
    return service.public_patient(patient, with_qr=True)


@app.patch("/patients/{code}")
def update_patient(body: PatientUpdate, patient: dict = Depends(patient_by_code)):
    return service.update_patient(store, patient, body.model_dump())


@app.get("/patients/{code}/appointments")
def patient_appointments(patient: dict = Depends(patient_by_code)):
    return service.patient_appointments(store, patient)


@app.get("/patients/{code}/cases")
def patient_cases(patient: dict = Depends(patient_by_code)):
    return service.patient_cases(store, patient)


@app.get("/patients/{code}/cases/{case_id}")
def patient_case(case_id: str, patient: dict = Depends(patient_by_code)):
    return service.patient_case(store, patient, case_id)


@app.get("/patients/{code}/documents")
def patient_documents(patient: dict = Depends(patient_by_code)):
    return service.patient_documents(store, patient)


# ── Intake ──────────────────────────────────────────────────────────────────

@app.post("/intake/next-question")
def next_question(body: NextQuestionIn):
    result, _, _ = run_safety(body.patient, body.messages)
    question, source = ai.next_question(body.patient, body.messages, body.language, urgent=result.level == "RED")
    return {
        "question": question,
        "done": question == ai.DONE_MESSAGE,
        "source": source,
        # Live safety check on every turn (keywords only, deterministic)
        "safety": {"level": result.level, "urgent": result.level == "RED",
                   "guidance": GUIDANCE["RED"] if result.level == "RED" else None},
    }


@app.post("/voice/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("en"), patient: dict = Depends(current_patient)):
    data = await file.read()
    try:
        return voice.transcribe(data, file.filename or "voice.m4a", file.content_type, language)
    except voice.VoiceError as e:
        raise HTTPException(e.status, str(e))


def _decode_b64(value: str) -> bytes:
    if "," in value[:100] and value.startswith("data:"):
        value = value.split(",", 1)[1]  # tolerate a data: URI prefix
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "The file could not be read. Please try again.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    return data


@app.post("/voice/transcribe-json")
def transcribe_json(body: AudioIn, patient: dict = Depends(current_patient)):
    """Same as /voice/transcribe, but the audio arrives as base64 JSON (reliable on Android)."""
    data = _decode_b64(body.audio_base64)
    try:
        return voice.transcribe(data, body.filename or "voice.m4a", body.mime, body.language)
    except voice.VoiceError as e:
        raise HTTPException(e.status, str(e))


@app.post("/voice/speak")
def speak(body: SpeakIn, patient: dict = Depends(current_patient)):
    try:
        return voice.speak(body.text, body.language)
    except voice.VoiceError as e:
        raise HTTPException(e.status, str(e))


@app.post("/documents", status_code=201)
async def upload_document(file: UploadFile = File(...), doc_type: Optional[str] = Form(None),
                          patient: dict = Depends(current_patient)):
    data = await file.read()
    try:
        return service.upload_document(store, patient, data, file.filename or "document", file.content_type, doc_type)
    except docs_pipeline.DocumentError as e:
        raise HTTPException(e.status, str(e))


@app.post("/documents/json", status_code=201)
def upload_document_json(body: DocumentIn, patient: dict = Depends(current_patient)):
    """Same as POST /documents, but the file arrives as base64 JSON (reliable on Android)."""
    data = _decode_b64(body.file_base64)
    try:
        return service.upload_document(store, patient, data, body.filename or "document", body.mime, body.doc_type)
    except docs_pipeline.DocumentError as e:
        raise HTTPException(e.status, str(e))


@app.post("/documents/warmup")
def documents_warmup(patient: dict = Depends(current_patient)):
    return {"ocr": docs_pipeline.warm_up()}


@app.get("/documents/{doc_id}/file")
def document_file(doc_id: str, doctor: dict = Depends(doctor_auth)):
    if not service.valid_uuid(doc_id):
        raise HTTPException(404, "Not found")
    rows = store.select("documents", {"id": ("eq", doc_id)}, limit=1)
    url = docs_pipeline.signed_url(rows[0].get("storage_path")) if rows else None
    if not url:
        raise HTTPException(404, "The original file is not available.")
    return {"url": url}


@app.post("/cases", status_code=201)
def create_case(body: CaseCreate, patient: dict = Depends(current_patient)):
    return service.create_case(store, body, patient)


# ── Doctor side ─────────────────────────────────────────────────────────────

@app.post("/auth/login")
def login(body: LoginIn):
    rows = store.select("doctors", {"email": ("eq", body.email.strip().lower())}, limit=1)
    doctor = rows[0] if rows else None
    if not doctor or not verify_password(body.password, doctor.get("password_hash")):
        raise HTTPException(401, "Wrong email or password.")
    return {"token": issue_token(doctor["id"], doctor["name"]), "doctor": service.public_doctor(doctor)}


@app.get("/auth/me")
def me(doctor: dict = Depends(doctor_auth)):
    rows = store.select("doctors", {"id": ("eq", doctor["sub"])}, limit=1)
    if not rows:
        raise HTTPException(401, "Please sign in again.")
    return service.public_doctor(rows[0])


@app.get("/diagnostics")
def diagnostics(doctor: dict = Depends(doctor_auth)):
    """Which integrations work right now (no secrets in the output)."""
    db = "ok"
    try:
        store.select("doctors", limit=1)
    except StorageError as e:
        db = str(e)[:200]
    return {"storage": store.name, "database": db, "groq": ai.ai_enabled(), "sarvam": voice.enabled(),
            "paddleocr": bool(os.getenv("PADDLEOCR_URL")), "gemini": docs_pipeline.gemini_diagnostics()}


@app.get("/doctors")
def doctors(doctor: dict = Depends(doctor_auth)):
    return service.list_doctors(store)


@app.patch("/doctors/{doctor_id}/availability")
def availability(doctor_id: str, body: AvailabilityUpdate, doctor: dict = Depends(doctor_auth)):
    return service.set_availability(store, doctor_id, body.availability_status, body.busy_minutes)


@app.post("/demo/reset")
def demo_reset(body: DemoReset, doctor: dict = Depends(doctor_auth)):
    return service.reset_demo(store, body.cancel_upcoming)


@app.get("/cases")
def list_cases(
    triage_level: Optional[Literal["RED", "YELLOW", "GREEN"]] = None,
    status: Optional[Literal["new", "reviewed", "follow_up"]] = None,
    limit: int = Query(100, ge=1, le=500),
    doctor: dict = Depends(doctor_auth),
):
    return service.list_cases(store, triage_level, status, limit)


@app.get("/cases/{case_id}")
def get_case(case_id: str, doctor: dict = Depends(doctor_auth)):
    return service.get_case(store, case_id)


@app.patch("/cases/{case_id}")
def update_case(case_id: str, body: StatusUpdate, doctor: dict = Depends(doctor_auth)):
    return service.update_case_status(store, case_id, body.status)


@app.get("/appointments")
def list_appointments(active: bool = True, mine: bool = False, doctor: dict = Depends(doctor_auth)):
    return service.list_appointments(store, active, doctor["sub"] if mine else None)


@app.post("/appointments", status_code=201)
def request_appointment(body: AppointmentRequest, patient: dict = Depends(current_patient)):
    return service.rebook_routine(store, patient, body.case_id, body.preferred_at)


@app.get("/appointments/{appointment_id}")
def get_appointment(appointment_id: str, doctor: dict = Depends(doctor_auth)):
    return service.get_appointment(store, appointment_id)


@app.patch("/appointments/{appointment_id}")
def update_appointment(appointment_id: str, body: AppointmentStatusUpdate, doctor: dict = Depends(doctor_auth)):
    return service.set_appointment_status(store, appointment_id, body.status)
