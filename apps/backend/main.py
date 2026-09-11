import logging
import os
import uuid
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

import ai  # noqa: E402  (reads env at call time, after load_dotenv)
from keywords import find_flags, mentions_pregnancy  # noqa: E402
from models import CaseCreate, NextQuestionIn, StatusUpdate  # noqa: E402
from safety_engine import TriageInput, TriageResult, Vitals, triage  # noqa: E402
from storage import get_store  # noqa: E402

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="MediBridge API", version="0.2.0")

_default_origins = "http://localhost:3000,http://localhost:3001,http://localhost:8081"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = get_store()

# Patient-facing guidance per urgency class. Not a diagnosis.
GUIDANCE = {
    "RED": "Your answers include signs that need urgent attention. Please tell the reception or nursing staff "
           "right now. If you are not at a hospital, go to the nearest emergency department or call 108 / 112.",
    "YELLOW": "A doctor will see you as a priority. Please stay nearby and tell staff straight away if you feel worse.",
    "GREEN": "Your information has been sent to the doctor. You will be seen in turn. Tell staff if anything gets worse.",
}


def run_safety(patient, messages, vitals=None, llm_flags=()) -> tuple[TriageResult, list[str], bool]:
    """Keyword flags ∪ LLM flags → deterministic Safety Engine."""
    text = "\n".join(m.text for m in messages if m.role == "patient")
    keyword_flags = find_flags(text)
    pregnant = bool(patient.pregnant) or mentions_pregnancy(text)
    result = triage(TriageInput(
        flags=keyword_flags | set(llm_flags),
        age=patient.age,
        pregnant=pregnant,
        vitals=Vitals(**vitals.model_dump()) if vitals else Vitals(),
    ))
    return result, sorted(keyword_flags), pregnant


def _check_id(case_id: str) -> None:
    try:
        uuid.UUID(case_id)
    except ValueError:
        raise HTTPException(404, "Case not found")


@app.get("/health")
def health():
    return {"status": "ok", "storage": store.name, "ai": "groq" if ai.ai_enabled() else "rules"}


@app.post("/intake/next-question")
def next_question(body: NextQuestionIn):
    question, source = ai.next_question(body.patient, body.messages, body.language)
    result, _, _ = run_safety(body.patient, body.messages)
    return {
        "question": question,
        "done": question == ai.DONE_MESSAGE,
        "source": source,
        # Live safety check on every turn (keywords only, deterministic)
        "safety": {"level": result.level, "urgent": result.level == "RED",
                   "guidance": GUIDANCE["RED"] if result.level == "RED" else None},
    }


@app.post("/cases", status_code=201)
def create_case(body: CaseCreate):
    extraction = ai.extract(body.patient, body.messages, body.documents)
    result, keyword_flags, pregnant = run_safety(body.patient, body.messages, body.vitals, extraction["llm_flags"])
    extraction["keyword_flags"] = keyword_flags
    summary = extraction.pop("summary")

    row = store.create({
        "status": "new",
        "triage_level": result.level,
        "language": body.language,
        "patient": {**body.patient.model_dump(), "pregnant": pregnant},
        "messages": [m.model_dump() for m in body.messages],
        "documents": [d.model_dump() for d in body.documents],
        "vitals": body.vitals.model_dump() if body.vitals else None,
        "extraction": extraction,
        "summary": summary,
        "triage": result.to_dict(),
    })
    return {**row, "guidance": GUIDANCE[result.level]}


@app.get("/cases")
def list_cases(
    triage_level: Optional[Literal["RED", "YELLOW", "GREEN"]] = None,
    status: Optional[Literal["new", "reviewed", "follow_up"]] = None,
    limit: int = Query(100, ge=1, le=500),
):
    return store.list(triage_level, status, limit)


@app.get("/cases/{case_id}")
def get_case(case_id: str):
    _check_id(case_id)
    row = store.get(case_id)
    if row is None:
        raise HTTPException(404, "Case not found")
    return row


@app.patch("/cases/{case_id}")
def update_case(case_id: str, body: StatusUpdate):
    _check_id(case_id)
    row = store.update(case_id, {"status": body.status})
    if row is None:
        raise HTTPException(404, "Case not found")
    return row
