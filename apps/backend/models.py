from typing import Literal, Optional

from pydantic import BaseModel, Field


class Patient(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    age: Optional[int] = Field(None, ge=0, le=130)
    sex: Optional[Literal["male", "female", "other"]] = None
    phone: Optional[str] = Field(None, max_length=20)
    pregnant: Optional[bool] = None


class Message(BaseModel):
    role: Literal["patient", "assistant"]
    text: str = Field(min_length=1, max_length=4000)


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
    documents: list[Document] = Field(default_factory=list, max_length=20)
    vitals: Optional[VitalsIn] = None


class NextQuestionIn(BaseModel):
    patient: Patient = Patient()
    language: str = Field("en", max_length=10)
    messages: list[Message] = Field(default_factory=list, max_length=100)


class StatusUpdate(BaseModel):
    status: Literal["new", "reviewed", "follow_up"]
