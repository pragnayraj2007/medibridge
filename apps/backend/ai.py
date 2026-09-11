"""Groq clinical agent: intake questions, fact extraction, doctor summary.

The summary is written from the fused patient context (fusion.py): profile,
conversation, voice, documents, previous cases, vitals, and any conflicts
between them. The model only extracts and summarises. It never assigns urgency: its `flags`
are limited to the Safety Engine's vocabulary and go to the engine as input.
Without GROQ_API_KEY (or if a call fails) everything falls back to rules, so
the app keeps working.
"""
from __future__ import annotations

import json
import logging
import os
import re

import httpx

from safety_engine import VOCABULARY

log = logging.getLogger("medibridge.ai")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

LANGUAGES = {"en": "English", "hi": "Hindi", "te": "Telugu", "ta": "Tamil", "kn": "Kannada", "mr": "Marathi"}

# Interview length is fixed in code, never left to the model:
#   basic problem   -> 6 questions
#   serious problem -> 4 questions (the Safety Engine has flagged RED)
MAX_QUESTIONS = int(os.getenv("INTAKE_BASIC_QUESTIONS", "6"))
URGENT_MAX_QUESTIONS = int(os.getenv("INTAKE_SERIOUS_QUESTIONS", "4"))

# One fixed topic per question: (what to ask about, English fallback if the AI is unavailable)
BASIC_PLAN = [
    ("the main problem that brought them in today", "What is the main problem that brought you in today?"),
    ("when it started, and whether it is getting better or worse", "When did it start, and is it getting better or worse?"),
    ("how bad it is on a scale of 1 to 10", "How bad is it on a scale of 1 to 10?"),
    ("any other symptoms they have noticed", "Do you have any other symptoms, like fever, vomiting, or trouble breathing?"),
    ("any long-term conditions, like diabetes or high blood pressure", "Do you have any long-term conditions, like diabetes or high blood pressure?"),
    ("any medicines they take and any allergies", "Are you taking any medicines, and do you have any allergies?"),
]
SERIOUS_PLAN = [
    ("the main problem that brought them in today", "What is the main problem that brought you in today?"),
    ("when it started, and how bad it is on a scale of 1 to 10", "When did it start, and how bad is it on a scale of 1 to 10?"),
    ("any other symptoms they have noticed", "Do you have any other symptoms, like fever, vomiting, or trouble breathing?"),
    ("any long-term conditions, medicines they take, and allergies", "Do you have any long-term conditions, take any medicines, or have any allergies?"),
]
FALLBACK_QUESTIONS = [q for _, q in BASIC_PLAN]
DONE_MESSAGE = "Thank you, I have what I need. Tap 'Done answering' to continue."


def ai_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


def _chat(messages: list[dict], json_mode: bool = False, timeout: float = 20, extra: dict | None = None) -> str:
    body = {"model": GROQ_MODEL, "messages": messages, "temperature": 0.2, **(extra or {})}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    headers = {"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"}
    r = httpx.post(GROQ_URL, headers=headers, json=body, timeout=timeout)
    if r.status_code == 400 and extra:  # the model rejected an optional parameter: retry without it
        log.warning("Groq rejected %s, retrying without it", sorted(extra))
        body = {k: v for k, v in body.items() if k not in extra}
        r = httpx.post(GROQ_URL, headers=headers, json=body, timeout=timeout)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"] or ""


def _transcript(messages) -> str:
    return "\n".join(f"{'Patient' if m.role == 'patient' else 'Assistant'}: {m.text}" for m in messages)


def _patient_line(p) -> str:
    bits = [f"age {p.age}" if p.age is not None else "age unknown", p.sex or "sex unknown"]
    if p.pregnant:
        bits.append("pregnant")
    return ", ".join(bits)


# ── Intake conversation ─────────────────────────────────────────────────────

NEXT_QUESTION_PROMPT = """You are MediBridge, a friendly intake assistant collecting information for a doctor before a clinic visit.
Write question {number} of {total}, in {language}. Ask ONLY about: {topic}.
- One short, simple question in plain everyday words.
- Ask only about that topic. Do not bring up any other topic, and never mention anything the patient has not said.
- If the patient has already clearly answered this topic, ask one short follow-up about the same topic instead.
- Answers may be speech-to-text and contain recognition errors or mixed languages; understand them as best you can.
- Never offer answer options or multiple-choice lists.
- Never diagnose, never say how urgent it is, never give treatment advice. If the patient describes an emergency happening now, first tell them to alert staff immediately, then ask the question.
Reply with the question only."""


def next_question(patient, messages, language: str = "en", urgent: bool = False) -> tuple[str, str]:
    """Returns (question, source). Question == DONE_MESSAGE when intake is complete.
    Basic problems get MAX_QUESTIONS questions; once the Safety Engine flags RED the
    interview is cut to URGENT_MAX_QUESTIONS. Each question has a fixed topic."""
    asked = sum(1 for m in messages if m.role == "assistant")
    plan = SERIOUS_PLAN if urgent else BASIC_PLAN
    limit = min(URGENT_MAX_QUESTIONS, len(plan)) if urgent else min(MAX_QUESTIONS, len(plan))
    if asked >= limit:
        return DONE_MESSAGE, "rules"
    topic, fallback = plan[asked]
    if ai_enabled():
        prompt = NEXT_QUESTION_PROMPT.format(number=asked + 1, total=limit, topic=topic,
                                             language=LANGUAGES.get(language, "English"))
        chat = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"Patient: {_patient_line(patient)}\n\n{_transcript(messages) or '(no messages yet)'}"},
        ]
        for attempt in range(2):  # one retry on a network or API error
            try:
                reply = _chat(chat, timeout=12, extra={"reasoning_effort": "low"}).strip().strip('"').strip()
                if reply and not reply.upper().startswith("DONE"):
                    return reply[:500], "groq"
                break
            except Exception as e:  # network, auth, quota, bad response
                log.warning("Groq next_question failed (attempt %s): %s", attempt + 1, type(e).__name__)
    return fallback, "rules"


# ── Extraction + summary ────────────────────────────────────────────────────

EXTRACT_PROMPT = """You extract clinical intake data for a doctor. Use ONLY what the patient said; do not guess.
You do NOT diagnose and you do NOT decide urgency.
Return a JSON object with exactly these keys:
  "symptoms": [short strings],
  "duration": string or null,
  "severity": string or null,
  "history": [conditions / past history],
  "medications": [strings],
  "allergies": [strings],
  "flags": [keys from the list below that the patient's words clearly indicate]
Write every value in English, even if the conversation is in another language.
Allowed flag keys:
{vocab}"""


def _parse_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return json.loads(match.group(0) if match else text)


def _str_list(value) -> list[str]:
    return [str(x)[:200] for x in value][:30] if isinstance(value, list) else []


def extract(patient, messages, documents=()) -> dict:
    if ai_enabled():
        try:
            vocab = "\n".join(f"- {k}: {v}" for k, v in VOCABULARY.items())
            raw = _chat([
                {"role": "system", "content": EXTRACT_PROMPT.format(vocab=vocab)},
                {"role": "user", "content": f"Patient: {_patient_line(patient)}\n\n{_transcript(messages)}"},
            ], json_mode=True)
            data = _parse_json(raw)
            return {
                "source": "groq",
                "model": GROQ_MODEL,
                "symptoms": _str_list(data.get("symptoms")),
                "duration": data.get("duration"),
                "severity": data.get("severity"),
                "history": _str_list(data.get("history")),
                "medications": _str_list(data.get("medications")),
                "allergies": _str_list(data.get("allergies")),
                "llm_flags": sorted(f for f in _str_list(data.get("flags")) if f in VOCABULARY),
            }
        except Exception as e:
            log.warning("Groq extraction failed, using fallback: %s", e)

    return {
        "source": "rules",
        "model": None,
        "symptoms": [],
        "duration": None,
        "severity": None,
        "history": [],
        "medications": [],
        "allergies": [],
        "llm_flags": [],
    }


# ── Doctor summary from the fused context ──────────────────────────────────

SUMMARY_PROMPT = """You write a neutral clinical intake summary for a doctor from a structured patient context (JSON).
Rules:
- 4-7 sentences in English. Facts only; attribute them to their source (patient, voice, document name, previous case).
- If the context lists conflicts, state every conflicting value with its source. Never pick one side or merge them.
- Mention relevant previous cases and document findings briefly. Leave out fields that are unknown, empty or not applicable.
- No diagnosis, no treatment advice.
- Do not state or imply urgency, triage level, red flags or their absence: a separate deterministic Safety Engine decides urgency and the doctor sees it separately."""


def summarize(context: dict) -> tuple[str, str]:
    """Returns (summary, source) where source is "groq" or "rules"."""
    if ai_enabled():
        try:
            reply = _chat([
                {"role": "system", "content": SUMMARY_PROMPT},
                {"role": "user", "content": json.dumps(context, ensure_ascii=False, default=str)[:24000]},
            ]).strip()
            if reply:
                return reply[:3000], "groq"
        except Exception as e:
            log.warning("Groq summary failed, using fallback: %s", e)
    return rules_summary(context), "rules"


def rules_summary(ctx: dict) -> str:
    p, cur = ctx.get("patient", {}), ctx.get("current", {})
    bits = [f"{p.get('name') or 'Patient'} ({p.get('patient_code') or 'no ID'}), age {p.get('age', 'unknown')}, {p.get('sex') or 'sex unknown'}."]
    if cur.get("symptoms"):
        bits.append("Reports: " + ", ".join(cur["symptoms"]) + ".")
    if cur.get("duration"):
        bits.append(f"Duration: {cur['duration']}.")
    docs = [d for d in ctx.get("documents", []) if d.get("findings")]
    for d in docs:
        s = (d["findings"] or {}).get("summary")
        if s:
            bits.append(f"Document {d.get('name')}: {s}")
    if ctx.get("previous_cases"):
        bits.append(f"{len(ctx['previous_cases'])} previous case(s) on record.")
    for c in ctx.get("conflicts", []):
        bits.append(f"{c['kind'].capitalize()} ({c['field']}): " + " vs ".join(f"{s['source']}: {s['value']}" for s in c["statements"]) + ".")
    bits.append("[AI summary unavailable - review the full intake.]")
    return " ".join(bits)
