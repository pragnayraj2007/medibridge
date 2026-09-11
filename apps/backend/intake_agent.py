"""Intake agent: reasons privately, uses the patient's records, adapts to the person.

One Groq call per question (no extra round trips). The model returns JSON with
private reasoning, what is already known, and the single next question. The
reasoning is never shown to the patient. Hard limits stay in code: the question
cap, DONE handling and the fallback questions. The model never decides urgency;
it only sees which danger signs the deterministic Safety Engine already found,
so it can ask about related signs.
"""
from __future__ import annotations

import json
import logging
import re
import time

import ai

log = logging.getLogger("medibridge.intake")

# Warning signs worth asking about per complaint (they feed the Safety Engine's rules)
CHECKLIST = """- chest pain/pressure: spreading to arm, jaw or back; sweating; breathlessness; fainting
- breathing difficulty: can they speak full sentences; blue lips; wheezing; chest pain
- headache: sudden or worst ever; stiff neck; fever; confusion; weakness on one side; vision changes; pregnancy
- abdominal pain: where; severe or worsening; vomiting everything; blood in vomit or stool; pregnancy or missed period
- fever: how high and how long; stiff neck; confusion; rash spreading fast; breathing difficulty
- bleeding: how much; does it stop; pregnancy; feeling faint
- weakness/numbness/speech: sudden; one side of the body; face droop; when it started exactly
- injury: how it happened (road accident, fall from height); deformity; heavy bleeding
- pregnancy: bleeding; severe headache; vision changes; fits; severe abdominal pain; labour signs
- other complaints: onset, severity 1-10, what makes it better or worse"""

AGENT_PROMPT = """You are MediBridge's intake agent: a warm, experienced triage nurse collecting information for a doctor before a clinic visit.
Think privately first, then ask ONE short question in {language}.

Rules
- At most {limit} questions in total; {asked} already asked, so {left} left. Every question must earn its place: combine related items (for example when it started and how bad it is from 1 to 10).
- In "thinking", briefly consider what could be serious given everything known, then choose the single most useful next question. Prefer questions about warning signs from the checklist that fit the complaint.
- Use the patient's records: never ask for something the records or conversation already answer. You may briefly confirm a recorded fact inside another question (for example "Your report lists metformin - are you still taking it, and any other medicines?").
- Adapt to the person: if the last answer was vague, "I don't know", confused or off-topic, rephrase simply and give one plain example. If they seem worried or in pain, start with a few kind words. Use short, everyday words.
- Spoken answers are speech-to-text and may contain errors or mixed languages (e.g. Hinglish). Understand them; ask to repeat only if truly unclear.
- Never diagnose, never name a disease as theirs, never say how urgent it is, never give treatment advice. If the patient describes an emergency happening now, tell them to alert staff immediately, then still ask your question.
- Set "done": true when the doctor has enough (main problem, onset and severity, key warning signs, relevant conditions/medicines/allergies) or no questions are left.

Warning-sign checklist
{checklist}

Return JSON only:
{{"thinking": "private, under 60 words", "known": {{"complaint": str|null, "onset": str|null, "severity": str|null, "warning_signs": str|null, "history": str|null}}, "done": true|false, "question": "the next question in {language}, or empty if done"}}"""


# Patient records are loaded once per consultation and cached in the warm function instance.
_BRIEF_CACHE: dict[str, tuple[float, str]] = {}
_BRIEF_TTL = 600


def build_brief(profile: dict | None, previous_cases: list[dict], documents: list[dict]) -> str:
    """Compact, deterministic summary of what the records already say (no AI)."""
    if not profile:
        return "No records (new or anonymous patient)."
    lines = []
    preg = profile.get("pregnancy_status")
    if profile.get("sex") == "female" and preg and preg != "unknown":
        lines.append(f"Profile pregnancy status: {preg.replace('_', ' ')}")
    for c in previous_cases[:3]:
        ex = c.get("extraction") or {}
        bits = [str(c.get("created_at", ""))[:10], c.get("triage_level") or ""]
        if ex.get("symptoms"):
            bits.append("symptoms: " + ", ".join(ex["symptoms"][:5]))
        if ex.get("duration"):
            bits.append(f"duration then: {ex['duration']}")
        if ex.get("medications"):
            bits.append("medicines: " + ", ".join(ex["medications"][:5]))
        if ex.get("allergies"):
            bits.append("allergies: " + ", ".join(ex["allergies"][:5]))
        lines.append("Previous visit " + "; ".join(b for b in bits if b))
    for d in documents[:3]:
        f = (d.get("analysis") or {}).get("findings") or {}
        if not f:
            continue
        bits = [f.get("document_type") or d.get("doc_type") or "document"]
        for key, label in (("diagnoses_mentioned", "conditions"), ("medications", "medicines"), ("allergies", "allergies")):
            if f.get(key):
                bits.append(f"{label}: " + ", ".join(map(str, f[key][:5])))
        abnormal = [f"{x['name']} {x['value']}{(' ' + x['unit']) if x.get('unit') else ''} ({x['flag']})"
                    for x in f.get("lab_results") or [] if x.get("flag") in ("high", "low")]
        if abnormal:
            bits.append("abnormal labs: " + ", ".join(abnormal[:5]))
        lines.append("Uploaded report - " + "; ".join(bits))
    return "\n".join(lines)[:1500] or "No previous visits or reports on record."


def cached_brief(store, patient: dict | None) -> str:
    if not patient:
        return build_brief(None, [], [])
    hit = _BRIEF_CACHE.get(patient["id"])
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        cases = store.select("cases", {"patient_id": ("eq", patient["id"])}, order="created_at", desc=True, limit=3)
        docs = store.select("documents", {"patient_id": ("eq", patient["id"]), "status": ("in", ["processed", "partial"])},
                            order="created_at", desc=True, limit=3)
    except Exception as e:  # records are a bonus; the interview works without them
        log.warning("Could not load patient records for intake: %s", e)
        cases, docs = [], []
    brief = build_brief(patient, cases, docs)
    _BRIEF_CACHE[patient["id"]] = (time.time() + _BRIEF_TTL, brief)
    return brief


def _parse(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return json.loads(match.group(0) if match else text)


def next_question(patient, messages, language: str = "en", urgent: bool = False,
                  brief: str = "", safety_labels: list[str] = ()) -> tuple[str, str, dict]:
    """Returns (question, source, meta). question == ai.DONE_MESSAGE when the intake is complete.
    meta holds the private reasoning and known facts (for logs; never sent to the patient)."""
    asked = sum(1 for m in messages if m.role == "assistant")
    limit = min(ai.MAX_QUESTIONS, ai.URGENT_MAX_QUESTIONS) if urgent else ai.MAX_QUESTIONS
    if asked >= limit:
        return ai.DONE_MESSAGE, "rules", {}
    if ai.ai_enabled():
        try:
            lang = ai.LANGUAGES.get(language, "English")
            system = AGENT_PROMPT.format(language=lang, limit=limit, asked=asked, left=limit - asked, checklist=CHECKLIST)
            user = (f"Patient: {ai._patient_line(patient)}\n"
                    f"Records:\n{brief or 'none'}\n"
                    f"Warning signs already detected by the safety rules: {', '.join(safety_labels) or 'none'}\n\n"
                    f"Conversation so far:\n{ai._transcript(messages) or '(none yet - ask about the main problem)'}")
            raw = ai._chat([{"role": "system", "content": system}, {"role": "user", "content": user}],
                           json_mode=True, timeout=15, extra={"reasoning_effort": "low"})
            data = _parse(raw)
            question = str(data.get("question") or "").strip()
            meta = {"thinking": str(data.get("thinking") or "")[:400], "known": data.get("known") or {}}
            if data.get("done") is True and asked >= 1:
                return ai.DONE_MESSAGE, "groq", meta
            if question and not question.upper().startswith("DONE"):
                return question[:500], "groq", meta
        except Exception as e:  # network, quota, invalid JSON
            log.warning("Intake agent failed, using fallback: %s", type(e).__name__)
    if asked < len(ai.FALLBACK_QUESTIONS):
        return ai.FALLBACK_QUESTIONS[asked], "rules", {}
    return ai.DONE_MESSAGE, "rules", {}
