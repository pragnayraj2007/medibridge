"""Deterministic Safety Engine: the final urgency authority in MediBridge.

The LLM never decides triage. It (and the keyword matcher) only produce flags
from a fixed vocabulary; this module turns flags + age + pregnancy + vitals into
RED / YELLOW / GREEN. Pure Python, no I/O: the same input always gives the same
output.

Criteria follow the WHO / ICRC / MSF Interagency Integrated Triage Tool (IITT),
adult version (age >= 12): https://www.who.int/tools/triage
Rules marked source="MediBridge" are extra conservative rules for self-reported
intake, not IITT criteria.

RED / YELLOW / GREEN are urgency classes, not diagnoses. Thresholds must be
reviewed by a clinician before any real-world use.
"""
from __future__ import annotations

from dataclasses import dataclass, field

ENGINE_VERSION = "iitt-adult-0.1"

RED, YELLOW, GREEN = "RED", "YELLOW", "GREEN"
_RANK = {GREEN: 0, YELLOW: 1, RED: 2}

# ── Flag vocabulary ─────────────────────────────────────────────────────────
# key -> description. The descriptions are also shown to the LLM so it can only
# pick from this list.

RED_FLAGS = {
    "unresponsive": "Unresponsive / unconscious",
    "stridor": "Stridor (high-pitched noisy breathing)",
    "respiratory_distress": "Respiratory distress (severe difficulty breathing, gasping, choking)",
    "central_cyanosis": "Central cyanosis (blue lips or tongue)",
    "cap_refill_gt3": "Capillary refill > 3 seconds",
    "weak_fast_pulse": "Weak and fast pulse",
    "heavy_bleeding": "Heavy bleeding",
    "high_risk_trauma": "High-risk trauma (road accident, fall from height, stabbing, gunshot)",
    "poisoning": "Poisoning, overdose or dangerous chemical exposure",
    "threatened_limb": "Threatened limb (cold, pale, pulseless limb)",
    "snake_bite": "Snake bite",
    "violent_aggressive": "Violent or aggressive",
    "active_convulsions": "Active convulsions / seizure happening now",
    "hypoglycaemia": "Hypoglycaemia (low blood sugar)",
}

YELLOW_FLAGS = {
    "mouth_throat_neck_swelling": "Swelling or mass of mouth, throat or neck",
    "wheezing": "Wheezing",
    "vomits_everything_or_ongoing_diarrhoea": "Vomits everything or ongoing diarrhoea",
    "unable_to_feed_or_drink": "Unable to eat or drink",
    "severe_pallor": "Severe pallor",
    "ongoing_bleeding": "Ongoing bleeding (not heavy)",
    "recent_fainting": "Recent fainting / collapse",
    "altered_mental_status": "Altered mental status, confusion or agitation",
    "acute_general_weakness": "Acute general weakness",
    "acute_focal_neuro": "Acute focal neurological complaint (face droop, one-sided weakness, slurred speech)",
    "acute_visual_disturbance": "Acute visual disturbance",
    "severe_pain": "Severe pain",
    "worsening_rash": "New rash worsening over hours, or peeling skin",
    "limb_deformity_or_open_fracture": "Visible limb deformity or open fracture",
    "dislocation": "Suspected dislocation",
    "trauma_or_burns": "Other trauma or burns",
    "urgent_surgical_diagnosis": "Known diagnosis requiring urgent surgery",
    "sexual_assault": "Sexual assault",
    "testicular_pain_or_priapism": "Acute testicular/scrotal pain or priapism",
    "unable_to_pass_urine": "Unable to pass urine",
    "time_sensitive_prophylaxis": "Exposure needing time-sensitive prophylaxis (e.g. dog bite, needlestick)",
    "pregnancy_complication": "Pregnancy, referred for complications",
}

# Flags that only matter in combination (age, pregnancy, other flags).
MODIFIER_FLAGS = {
    "chest_pain": "Chest pain, tightness or pressure",
    "abdominal_pain": "Abdominal / stomach pain",
    "severe_abdominal_pain": "Severe abdominal pain",
    "headache": "Headache",
    "severe_headache": "Severe or sudden 'worst ever' headache",
    "stiff_neck": "Stiff neck",
    "fever": "Fever",
    "hypothermia": "Hypothermia (very cold body)",
    "active_labour": "Active labour (contractions, waters broken)",
    "recent_seizure": "Seizure or fit in the recent past (not happening now)",
    "breathing_difficulty": "Shortness of breath / difficulty breathing (not severe)",
}

VOCABULARY = {**RED_FLAGS, **YELLOW_FLAGS, **MODIFIER_FLAGS}


# ── Input / output ──────────────────────────────────────────────────────────

@dataclass
class Vitals:
    hr: float | None = None      # heart rate, beats/min
    rr: float | None = None      # respiratory rate, breaths/min
    spo2: float | None = None    # oxygen saturation, %
    temp: float | None = None    # temperature, °C
    sbp: float | None = None     # systolic BP, mmHg
    dbp: float | None = None     # diastolic BP, mmHg


@dataclass
class TriageInput:
    flags: set[str] = field(default_factory=set)
    age: int | None = None
    pregnant: bool = False
    vitals: Vitals = field(default_factory=Vitals)


@dataclass
class Reason:
    rule_id: str
    level: str
    label: str
    source: str = "IITT"


@dataclass
class TriageResult:
    level: str
    reasons: list[Reason]
    engine_version: str = ENGINE_VERSION

    def to_dict(self) -> dict:
        return {
            "level": self.level,
            "reasons": [r.__dict__ for r in self.reasons],
            "engine_version": self.engine_version,
        }


# ── Engine ──────────────────────────────────────────────────────────────────

def _between(v: float | None, low: float, high: float) -> bool:
    """True if v is outside [low, high]. None means 'not measured'."""
    return v is not None and (v < low or v > high)


def triage(inp: TriageInput) -> TriageResult:
    flags = {f for f in inp.flags if f in VOCABULARY}  # unknown flags are ignored
    v = inp.vitals
    reasons: list[Reason] = []

    def add(rule_id: str, level: str, label: str, source: str = "IITT") -> None:
        reasons.append(Reason(rule_id, level, label, source))

    # RED: single criteria
    for key, label in RED_FLAGS.items():
        if key in flags:
            add(f"red.{key}", RED, label)

    if _between(v.hr, 50, 150):
        add("red.hr", RED, f"Heart rate {v.hr:g} (<50 or >150)")

    # RED: acute chest or abdominal pain in a patient over 50.
    # Unknown age is treated as possibly over 50 (conservative).
    pain = [p for p in ("chest_pain", "abdominal_pain", "severe_abdominal_pain") if p in flags]
    if pain:
        label = "Acute chest pain" if "chest_pain" in pain else "Acute abdominal pain"
        if inp.age is None:
            add("red.pain_age_unknown", RED, f"{label}, age unknown (treated as >50)", "MediBridge")
        elif inp.age > 50:
            add("red.pain_over_50", RED, f"{label}, age {inp.age} (>50)")
        else:
            add("yellow.pain_under_50", YELLOW, f"{label}, age {inp.age}", "MediBridge")

    # RED: pregnant with any danger sign
    if inp.pregnant:
        danger = {
            "heavy_bleeding": "heavy bleeding",
            "severe_abdominal_pain": "severe abdominal pain",
            "active_convulsions": "seizures",
            "recent_seizure": "seizures",
            "altered_mental_status": "altered mental status",
            "severe_headache": "severe headache",
            "acute_visual_disturbance": "visual changes",
            "active_labour": "active labour",
            "high_risk_trauma": "trauma",
            "trauma_or_burns": "trauma",
        }
        hits = sorted({label for key, label in danger.items() if key in flags})
        if (v.sbp is not None and v.sbp >= 160) or (v.dbp is not None and v.dbp >= 110):
            hits.append("BP ≥160/110")
        if hits:
            add("red.pregnancy_danger", RED, "Pregnant with " + ", ".join(hits))

    # RED: any two of altered mental status, stiff neck, fever/hypothermia, headache
    neuro = {
        "altered mental status": "altered_mental_status" in flags,
        "stiff neck": "stiff_neck" in flags,
        "fever/hypothermia": bool({"fever", "hypothermia"} & flags)
        or _between(v.temp, 36, 39),
        "headache": bool({"headache", "severe_headache"} & flags),
    }
    present = [name for name, hit in neuro.items() if hit]
    if len(present) >= 2:
        add("red.two_of_meningism", RED, "Any two of: " + ", ".join(present))

    # YELLOW: single criteria
    for key, label in YELLOW_FLAGS.items():
        if key in flags:
            add(f"yellow.{key}", YELLOW, label)

    if "severe_headache" in flags and "severe_pain" not in flags:
        add("yellow.severe_headache", YELLOW, "Severe pain (headache)")
    if "breathing_difficulty" in flags and "respiratory_distress" not in flags:
        add("yellow.breathing_difficulty", YELLOW, "Reported difficulty breathing", "MediBridge")
    if "recent_seizure" in flags and not inp.pregnant:
        add("yellow.recent_seizure", YELLOW, "Recent seizure", "MediBridge")
    if "active_labour" in flags and not inp.pregnant:
        add("yellow.active_labour", YELLOW, "Reported labour symptoms", "MediBridge")

    # YELLOW: vital signs
    if _between(v.hr, 60, 130) and not _between(v.hr, 50, 150):
        add("yellow.hr", YELLOW, f"Heart rate {v.hr:g} (<60 or >130)")
    if _between(v.rr, 10, 30):
        add("yellow.rr", YELLOW, f"Respiratory rate {v.rr:g} (<10 or >30)")
    if _between(v.temp, 36, 39):
        add("yellow.temp", YELLOW, f"Temperature {v.temp:g}°C (<36 or >39)")
    if v.spo2 is not None and v.spo2 < 92:
        add("yellow.spo2", YELLOW, f"SpO2 {v.spo2:g}% (<92)")

    # Adult tool only: children are never auto-classified GREEN.
    if inp.age is not None and inp.age < 12:
        add("yellow.paediatric", YELLOW, "Under 12 — adult tool not validated, clinician review", "MediBridge")

    level = max((r.level for r in reasons), key=_RANK.__getitem__, default=GREEN)
    reasons.sort(key=lambda r: -_RANK[r.level])
    return TriageResult(level=level, reasons=reasons)
