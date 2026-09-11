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
# Second model with its own rate limit, used for intake questions when the main one is busy
GROQ_FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b")

LANGUAGES = {"en": "English", "hi": "Hindi", "te": "Telugu", "ta": "Tamil", "kn": "Kannada", "mr": "Marathi"}

# Interview length is fixed in code, never left to the model:
#   basic problem   -> 6 questions
#   serious problem -> 4 questions (the Safety Engine has flagged RED)
MAX_QUESTIONS = int(os.getenv("INTAKE_BASIC_QUESTIONS", "6"))
URGENT_MAX_QUESTIONS = int(os.getenv("INTAKE_SERIOUS_QUESTIONS", "4"))

# One fixed topic per question. The model only phrases the question in the patient's language.
TOPICS = {
    "main": "the main problem that brought them in today",
    "onset": "when it started, and whether it is getting better or worse",
    "severity": "how bad it is on a scale of 1 to 10",
    "other": "any other symptoms they have noticed",
    "conditions": "any long-term conditions, like diabetes or high blood pressure",
    "medicines": "any medicines they take and any allergies",
    "onset_severity": "when it started, and how bad it is on a scale of 1 to 10",
    "history": "any long-term conditions, medicines they take, and allergies",
}
BASIC_PLAN = ["main", "onset", "severity", "other", "conditions", "medicines"]
SERIOUS_PLAN = ["main", "onset_severity", "other", "history"]

# Built-in questions for when the AI is unavailable, in every supported language
QUESTIONS = {
    "main": {
        "en": "What is the main problem that brought you in today?",
        "hi": "आज आप किस मुख्य समस्या के लिए आए हैं?",
        "te": "ఈ రోజు మీరు ఏ ముఖ్యమైన సమస్యతో వచ్చారు?",
        "ta": "இன்று நீங்கள் எந்த முக்கிய பிரச்சனைக்காக வந்துள்ளீர்கள்?",
        "kn": "ಇಂದು ನೀವು ಯಾವ ಮುಖ್ಯ ಸಮಸ್ಯೆಗಾಗಿ ಬಂದಿದ್ದೀರಿ?",
        "mr": "आज तुम्ही कोणत्या मुख्य त्रासासाठी आला आहात?",
    },
    "onset": {
        "en": "When did it start, and is it getting better or worse?",
        "hi": "यह कब शुरू हुआ, और क्या यह बेहतर हो रहा है या बदतर?",
        "te": "ఇది ఎప్పుడు మొదలైంది, తగ్గుతోందా లేదా ఎక్కువవుతోందా?",
        "ta": "இது எப்போது தொடங்கியது, குறைகிறதா அல்லது அதிகமாகிறதா?",
        "kn": "ಇದು ಯಾವಾಗ ಶುರುವಾಯಿತು, ಕಡಿಮೆಯಾಗುತ್ತಿದೆಯೇ ಅಥವಾ ಹೆಚ್ಚಾಗುತ್ತಿದೆಯೇ?",
        "mr": "हे कधी सुरू झाले, आणि ते कमी होत आहे की वाढत आहे?",
    },
    "severity": {
        "en": "How bad is it on a scale of 1 to 10?",
        "hi": "1 से 10 के पैमाने पर यह कितना गंभीर है?",
        "te": "1 నుండి 10 వరకు చూస్తే, ఇది ఎంత తీవ్రంగా ఉంది?",
        "ta": "1 முதல் 10 வரை, இது எவ்வளவு கடுமையாக உள்ளது?",
        "kn": "1 ರಿಂದ 10 ರವರೆಗೆ, ಇದು ಎಷ್ಟು ತೀವ್ರವಾಗಿದೆ?",
        "mr": "1 ते 10 च्या प्रमाणात, हे किती तीव्र आहे?",
    },
    "other": {
        "en": "Do you have any other symptoms, like fever, vomiting, or trouble breathing?",
        "hi": "क्या आपको कोई और लक्षण हैं, जैसे बुखार, उल्टी, या सांस लेने में तकलीफ?",
        "te": "జ్వరం, వాంతులు, లేదా శ్వాస తీసుకోవడంలో ఇబ్బంది వంటి ఇంకేమైనా లక్షణాలు ఉన్నాయా?",
        "ta": "காய்ச்சல், வாந்தி, அல்லது மூச்சு விடுவதில் சிரமம் போன்ற வேறு அறிகுறிகள் ஏதேனும் உள்ளதா?",
        "kn": "ಜ್ವರ, ವಾಂತಿ, ಅಥವಾ ಉಸಿರಾಟದ ತೊಂದರೆಯಂತಹ ಬೇರೆ ಲಕ್ಷಣಗಳು ಏನಾದರೂ ಇವೆಯೇ?",
        "mr": "ताप, उलटी, किंवा श्वास घेण्यास त्रास यांसारखी इतर काही लक्षणे आहेत का?",
    },
    "conditions": {
        "en": "Do you have any long-term conditions, like diabetes or high blood pressure?",
        "hi": "क्या आपको कोई पुरानी बीमारी है, जैसे डायबिटीज़ या हाई ब्लड प्रेशर?",
        "te": "షుగర్ లేదా బీపీ వంటి దీర్ఘకాలిక వ్యాధులు ఏమైనా ఉన్నాయా?",
        "ta": "சர்க்கரை நோய் அல்லது உயர் இரத்த அழுத்தம் போன்ற நீண்டகால நோய்கள் ஏதேனும் உள்ளதா?",
        "kn": "ಸಕ್ಕರೆ ಕಾಯಿಲೆ ಅಥವಾ ಅಧಿಕ ರಕ್ತದೊತ್ತಡದಂತಹ ದೀರ್ಘಕಾಲದ ಕಾಯಿಲೆಗಳು ಏನಾದರೂ ಇವೆಯೇ?",
        "mr": "मधुमेह किंवा उच्च रक्तदाब यांसारखे काही दीर्घकालीन आजार आहेत का?",
    },
    "medicines": {
        "en": "Are you taking any medicines, and do you have any allergies?",
        "hi": "क्या आप कोई दवा ले रहे हैं, और क्या आपको किसी चीज़ से एलर्जी है?",
        "te": "మీరు ఏమైనా మందులు వాడుతున్నారా, మీకు ఏమైనా అలర్జీలు ఉన్నాయా?",
        "ta": "நீங்கள் ஏதேனும் மருந்துகள் எடுத்துக்கொள்கிறீர்களா, உங்களுக்கு ஏதேனும் ஒவ்வாமை உள்ளதா?",
        "kn": "ನೀವು ಯಾವುದಾದರೂ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದೀರಾ, ನಿಮಗೆ ಯಾವುದಾದರೂ ಅಲರ್ಜಿ ಇದೆಯೇ?",
        "mr": "तुम्ही काही औषधे घेत आहात का, आणि तुम्हाला कशाची ऍलर्जी आहे का?",
    },
    "onset_severity": {
        "en": "When did it start, and how bad is it on a scale of 1 to 10?",
        "hi": "यह कब शुरू हुआ, और 1 से 10 के पैमाने पर यह कितना गंभीर है?",
        "te": "ఇది ఎప్పుడు మొదలైంది, 1 నుండి 10 వరకు చూస్తే ఎంత తీవ్రంగా ఉంది?",
        "ta": "இது எப்போது தொடங்கியது, 1 முதல் 10 வரை எவ்வளவு கடுமையாக உள்ளது?",
        "kn": "ಇದು ಯಾವಾಗ ಶುರುವಾಯಿತು, 1 ರಿಂದ 10 ರವರೆಗೆ ಎಷ್ಟು ತೀವ್ರವಾಗಿದೆ?",
        "mr": "हे कधी सुरू झाले, आणि 1 ते 10 च्या प्रमाणात किती तीव्र आहे?",
    },
    "history": {
        "en": "Do you have any long-term conditions, take any medicines, or have any allergies?",
        "hi": "क्या आपको कोई पुरानी बीमारी है, क्या आप कोई दवा लेते हैं, या क्या आपको कोई एलर्जी है?",
        "te": "మీకు దీర్ఘకాలిక వ్యాధులు, మీరు వాడే మందులు, లేదా అలర్జీలు ఏమైనా ఉన్నాయా?",
        "ta": "உங்களுக்கு நீண்டகால நோய்கள், எடுத்துக்கொள்ளும் மருந்துகள், அல்லது ஒவ்வாமை ஏதேனும் உள்ளதா?",
        "kn": "ನಿಮಗೆ ದೀರ್ಘಕಾಲದ ಕಾಯಿಲೆಗಳು, ತೆಗೆದುಕೊಳ್ಳುವ ಔಷಧಿಗಳು, ಅಥವಾ ಅಲರ್ಜಿ ಏನಾದರೂ ಇವೆಯೇ?",
        "mr": "तुम्हाला काही दीर्घकालीन आजार आहेत का, तुम्ही काही औषधे घेता का, किंवा कशाची ऍलर्जी आहे का?",
    },
}
FALLBACK_QUESTIONS = [QUESTIONS[k]["en"] for k in BASIC_PLAN]


def fallback_question(key: str, language: str) -> str:
    return QUESTIONS[key].get(language) or QUESTIONS[key]["en"]


DONE_MESSAGE = "Thank you, I have what I need. Tap 'Done answering' to continue."


def ai_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


def _chat(messages: list[dict], json_mode: bool = False, timeout: float = 20, extra: dict | None = None,
          model: str | None = None) -> str:
    body = {"model": model or GROQ_MODEL, "messages": messages, "temperature": 0.2, **(extra or {})}
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
    key = plan[asked]
    if ai_enabled():
        prompt = NEXT_QUESTION_PROMPT.format(number=asked + 1, total=limit, topic=TOPICS[key],
                                             language=LANGUAGES.get(language, "English"))
        chat = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"Patient: {_patient_line(patient)}\n\n{_transcript(messages) or '(no messages yet)'}"},
        ]
        # Main model first; if it fails (rate limit, network), a second model with its own limit
        for model in dict.fromkeys([GROQ_MODEL, GROQ_FALLBACK_MODEL]):
            try:
                reply = _chat(chat, timeout=12, extra={"reasoning_effort": "low"}, model=model).strip().strip('"').strip()
                if reply and not reply.upper().startswith("DONE"):
                    return reply[:500], "groq"
            except Exception as e:  # network, auth, quota, bad response
                status = getattr(getattr(e, "response", None), "status_code", "")
                log.warning("Groq next_question failed on %s: %s %s", model, type(e).__name__, status)
    # Built-in question for this topic, in the patient's language
    return fallback_question(key, language), "rules"


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
