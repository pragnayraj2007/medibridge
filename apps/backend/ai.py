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

FALLBACK_QUESTIONS = [
    "What is the main problem that brought you in today?",
    "When did it start, and is it getting better or worse?",
    "How bad is it on a scale of 1 to 10?",
    "Do you have any other symptoms, like fever, vomiting, or trouble breathing?",
    "Do you have any long-term conditions, like diabetes or high blood pressure?",
    "Are you taking any medicines, and do you have any allergies?",
]
DONE_MESSAGE = "Thank you, I have what I need. Tap 'Done answering' to continue."


def ai_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


def _chat(messages: list[dict], json_mode: bool = False, timeout: float = 20) -> str:
    body = {"model": GROQ_MODEL, "messages": messages, "temperature": 0.2}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = httpx.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"},
        json=body,
        timeout=timeout,
    )
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
Ask ONE short, simple question at a time, in {language}. Cover: main complaint, onset/duration, severity (1-10), associated symptoms, relevant history (conditions, medicines, allergies, pregnancy if relevant).
Patients answer in their own words, typed or spoken. Spoken answers are speech-to-text transcripts and may contain recognition errors: if an answer is unclear, ask them to repeat or clarify it.
Never offer answer options or multiple-choice lists; ask open questions.
Never diagnose, never say how urgent it is, never give treatment advice. If the patient describes an emergency, tell them to alert staff immediately.
When you have enough information (usually 5-7 questions), reply exactly: DONE"""


def next_question(patient, messages, language: str = "en") -> tuple[str, str]:
    """Returns (question, source). Question == DONE_MESSAGE when intake is complete."""
    asked = sum(1 for m in messages if m.role == "assistant")
    if ai_enabled():
        try:
            prompt = NEXT_QUESTION_PROMPT.format(language=LANGUAGES.get(language, "English"))
            reply = _chat([
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Patient: {_patient_line(patient)}\n\n{_transcript(messages) or '(no messages yet)'}"},
            ]).strip()
            if reply:
                return (DONE_MESSAGE if reply.upper().startswith("DONE") else reply), "groq"
        except Exception as e:  # network, auth, quota, bad response
            log.warning("Groq next_question failed, using fallback: %s", e)
    if asked < len(FALLBACK_QUESTIONS):
        return FALLBACK_QUESTIONS[asked], "rules"
    return DONE_MESSAGE, "rules"


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
- Mention relevant previous cases and document findings briefly.
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
