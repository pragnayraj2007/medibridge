from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Sex = Literal["male", "female", "other"]


class Patient(BaseModel):
    """Per-visit details sent with an intake (the Safety Engine needs age and sex)."""
    name: Optional[str] = Field(None, max_length=120)
    age: Optional[int] = Field(None, ge=0, le=130)
    sex: Optional[Sex] = None
    phone: Optional[str] = Field(None, max_length=20)


class Message(BaseModel):
    role: Literal["patient", "assistant"]
    text: str = Field(min_length=1, max_length=4000)
    via: Optional[Literal["text", "voice"]] = None  # how the patient answered


class Document(BaseModel):
    name: str = Field(max_length=200)
    type: Optional[str] = Field(None, max_length=50)  # e.g. "Lab Report"


class VitalsIn(BaseModel):
    hr: Optional[float] = Field(None, ge=0, le=300)
    rr: Optional[float] = Field(None, ge=0, le=100)
    spo2: Optional[float] = Field(None, ge=0, le=100)
    temp: Optional[float] = Field(None, ge=25, le=45)
    sbp: Optional[float] = Field(None, ge=0, le=300)
    dbp: Optional[float] = Field(None, ge=0, le=200)


class CaseCreate(BaseModel):
    patient: Patient = Patient()
    language: str = Field("en", max_length=10)
    messages: list[Message] = Field(min_length=1, max_length=100)
    documents: list[Document] = Field(default_factory=list, max_length=20)  # legacy: names only
    document_ids: list[str] = Field(default_factory=list, max_length=10)   # uploaded via POST /documents
    vitals: Optional[VitalsIn] = None


class NextQuestionIn(BaseModel):
    patient: Patient = Patient()
    language: str = Field("en", max_length=10)
    messages: list[Message] = Field(default_factory=list, max_length=100)


class StatusUpdate(BaseModel):
    status: Literal["new", "reviewed", "follow_up"]


# ── Patients ────────────────────────────────────────────────────────────────

class PatientRegister(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = Field(None, max_length=20)
    age: int = Field(ge=0, le=130)
    sex: Optional[Sex] = None
    language: str = Field("en", max_length=10)


class PatientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    phone: Optional[str] = Field(None, max_length=20)
    age: Optional[int] = Field(None, ge=0, le=130)
    sex: Optional[Sex] = None
    language: Optional[str] = Field(None, max_length=10)


# ── Doctors / appointments ──────────────────────────────────────────────────

class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class AvailabilityUpdate(BaseModel):
    availability_status: Literal["available", "busy", "offline"]
    # When busy: when the doctor expects to be free (optional). Ignored otherwise.
    busy_minutes: Optional[int] = Field(None, ge=5, le=24 * 60)


class AppointmentStatusUpdate(BaseModel):
    status: Literal["scheduled", "confirmed", "in_progress", "completed", "cancelled"]


class AppointmentRequest(BaseModel):
    """Patient-chosen time for a routine (GREEN) case; urgent cases are booked automatically."""
    case_id: str
    preferred_at: Optional[datetime] = None


class DemoReset(BaseModel):
    cancel_upcoming: bool = False


class AudioIn(BaseModel):
    """Voice upload as base64 JSON (Android-safe; multipart stays for the web)."""
    audio_base64: str = Field(min_length=4, max_length=6_000_000)
    filename: str = Field("voice.m4a", max_length=120)
    mime: Optional[str] = Field(None, max_length=80)
    language: str = Field("en", max_length=10)


class DocumentIn(BaseModel):
    """Document upload as base64 JSON (Android-safe; multipart stays for the web)."""
    file_base64: str = Field(min_length=4, max_length=6_000_000)
    filename: str = Field("document", max_length=200)
    mime: Optional[str] = Field(None, max_length=80)
    doc_type: Optional[str] = Field(None, max_length=60)


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    language: str = Field("en", max_length=10)
