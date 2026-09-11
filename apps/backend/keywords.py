"""Keyword safety net: finds danger-sign flags in the patient's own words.

Runs on every intake, with or without the LLM. Its flags are always merged
with the LLM's (the LLM can add flags, never remove them), so a missed or
failed AI call cannot hide a red flag.

Deliberately conservative: there is no negation handling ("no chest pain"
still flags chest pain). Over-triage is the safe failure mode; the doctor sees
every reason. English only for now.
"""
from __future__ import annotations

import re

_PATTERNS: dict[str, list[str]] = {
    # RED
    "unresponsive": [r"\bunresponsive\b", r"\bunconscious\b", r"\bnot responding\b"],
    "stridor": [r"\bstridor\b", r"\bnoisy breathing\b", r"\bhigh[- ]pitched breathing\b"],
    "respiratory_distress": [
        r"\bcan'?t breathe\b", r"\bcannot breathe\b", r"\b(?:unable|not able) to breathe\b",
        r"\bstruggling to breathe\b", r"\bgasping\b", r"\bchoking\b",
        r"\bsevere(?:ly)? (?:short(?:ness)? of breath|breathless)",
    ],
    "central_cyanosis": [r"\bblue lips\b", r"\blips (?:are |turning |turned )?blue\b", r"\bblue tongue\b", r"\bcyanosis\b"],
    "heavy_bleeding": [
        r"\bheavy bleeding\b", r"\bbleeding (?:heavily|a lot|non[- ]?stop)\b",
        r"\bbleeding (?:won'?t|will not|doesn'?t|does not) stop\b", r"\b(?:a )?lot of blood\b",
        r"\bprofuse(?:ly)? bleeding\b", r"\bha?emorrhag",
    ],
    "high_risk_trauma": [
        r"\b(?:car|bike|motorbike|bus|road) (?:accident|crash)\b", r"\broad traffic accident\b",
        r"\bhit by (?:a )?(?:car|bus|truck|lorry|vehicle|bike|motorbike|auto)\b",
        r"\bfell (?:from|off) (?:a |the )?(?:height|roof|building|terrace|tree|ladder|balcony)\b",
        r"\bfall from (?:a )?height\b", r"\bstabbed\b", r"\bstab wound\b", r"\bgunshot\b",
        r"\b(?:was|been|got) shot\b",
    ],
    "poisoning": [
        r"(?<!food )\bpoison", r"\boverdose\b", r"\bpesticide\b", r"\binsecticide\b",
        r"\btook too many (?:pills|tablets)\b",
        r"\b(?:swallowed|drank|drunk) (?:some )?(?:bleach|acid|kerosene|pesticide|chemicals?|phenyl)\b",
    ],
    "threatened_limb": [r"\bno pulse in (?:my |his |her )?(?:arm|leg|foot|hand)\b"],
    "snake_bite": [r"\bsnake ?bite\b", r"\bbitten by (?:a )?snake\b", r"\bsnake bit\b"],
    "active_convulsions": [r"\bhaving (?:a )?(?:seizure|fit|convulsion)s? (?:right )?now\b", r"\bseizing\b", r"\bconvulsing\b"],
    "hypoglycaemia": [r"\bhypoglyc", r"\blow (?:blood )?sugar\b", r"\bsugar (?:is |went |has )?(?:very )?(?:low|dropped)\b"],
    # YELLOW
    "mouth_throat_neck_swelling": [
        r"\b(?:throat|tongue|lips?|mouth|neck) (?:is |are |feels? )?swell",
        r"\bswollen (?:throat|tongue|lips?|mouth|neck)\b",
        r"\bswelling (?:of|in) (?:my |the )?(?:throat|tongue|lips?|mouth|neck)\b",
    ],
    "wheezing": [r"\bwheez"],
    "vomits_everything_or_ongoing_diarrhoea": [
        r"\bvomit(?:ing|s)? everything\b", r"\bcan'?t keep (?:anything|food|water|fluids) down\b",
        r"\b(?:continuous|constant|non[- ]?stop|repeated) (?:vomiting|diarrho?ea|loose motions)\b",
    ],
    "unable_to_feed_or_drink": [r"\b(?:can'?t|cannot|unable to|not able to) (?:eat or drink|drink)\b"],
    "severe_pallor": [r"\b(?:very|extremely) pale\b", r"\bsevere pallor\b"],
    "ongoing_bleeding": [
        r"\bbleeding\b", r"\bblood in (?:my |the )?(?:stool|urine|vomit|poo|cough)\b",
        r"\bvomiting blood\b", r"\bcoughing (?:up )?blood\b", r"\bblack stools?\b",
    ],
    "recent_fainting": [r"\bfaint(?:ed|ing)?\b", r"\bpassed out\b", r"\bblacked out\b", r"\bcollapsed\b"],
    "altered_mental_status": [r"\bconfus(?:ed|ion)\b", r"\bdisoriented\b", r"\bdrowsy\b", r"\bnot making sense\b", r"\bagitated\b"],
    "acute_general_weakness": [r"\b(?:sudden|severe|extreme) weakness\b", r"\btoo weak to\b"],
    "acute_focal_neuro": [
        r"\bface (?:is )?droop", r"\bdrooping face\b", r"\bslurred speech\b",
        r"\b(?:can'?t|cannot|unable to) (?:move|feel) (?:my |his |her )?(?:arm|leg|hand|face)\b",
        r"\b(?:weak|numb)(?:ness)? (?:on|in) one side\b", r"\bone side (?:of (?:my |the )?body )?(?:is )?(?:weak|numb)\b",
    ],
    "acute_visual_disturbance": [
        r"\bblurr(?:ed|y) vision\b", r"\bdouble vision\b", r"\bvision loss\b",
        r"\blost (?:my )?(?:vision|sight)\b", r"\bcan'?t see (?:anything|properly|clearly|out of)\b",
    ],
    "severe_pain": [
        r"\bsevere pain\b", r"\bexcruciating\b", r"\bunbearable\b", r"\bworst pain\b",
        r"\b(?:9|10) ?(?:/|out of) ?10\b",
    ],
    "worsening_rash": [r"\brash (?:is )?(?:spreading|getting worse|worsening)\b", r"\bpeeling skin\b", r"\bskin (?:is )?peeling\b"],
    "limb_deformity_or_open_fracture": [
        r"\bbone (?:is )?(?:sticking|poking) out\b", r"\bopen fracture\b", r"\bfracture",
        r"\bbroken (?:arm|leg|bone|wrist|ankle|hand|foot)\b",
    ],
    "dislocation": [r"\bdislocat"],
    "trauma_or_burns": [
        r"\bfell (?:down|off|from)\b", r"\bhad a fall\b", r"\binjur", r"\baccident\b",
        r"\bdeep cut\b", r"\bwound\b", r"\bhit my head\b", r"\bhead injury\b", r"\bburn(?:s|ed|t)?\b", r"\bscald",
    ],
    "sexual_assault": [r"\bsexual(?:ly)? assault", r"\braped\b", r"\brape\b"],
    "testicular_pain_or_priapism": [r"\btestic", r"\bscrot", r"\bpriapism\b"],
    "unable_to_pass_urine": [r"\b(?:can'?t|cannot|unable to|not able to) (?:pass urine|pee|urinate)\b"],
    "time_sensitive_prophylaxis": [
        r"\b(?:dog|animal|monkey|cat|bat) bite\b", r"\bbitten by (?:a )?(?:dog|cat|monkey|bat|animal)\b",
        r"\bneedle ?stick\b", r"\brabies\b",
    ],
    # Modifiers
    "chest_pain": [
        r"\bchest (?:pain|tightness|pressure|discomfort|hurts)\b", r"\bpain in (?:my |the )?chest\b",
        r"\btight(?:ness)? in (?:my |the )?chest\b",
    ],
    "abdominal_pain": [
        r"\b(?:abdominal|stomach|belly|tummy) (?:pain|ache|cramps?)\b", r"\bstomach ?ache\b",
        r"\bpain in (?:my |the )?(?:abdomen|stomach|belly|tummy)\b",
    ],
    "severe_abdominal_pain": [r"\bsevere (?:abdominal|stomach|belly|tummy) pain\b"],
    "headache": [r"\bhead ?aches?\b", r"\bmigraine\b"],
    "severe_headache": [r"\bsevere headache\b", r"\bworst headache\b", r"\bthunderclap\b"],
    "stiff_neck": [r"\bstiff neck\b", r"\bneck (?:is )?stiff\b"],
    "fever": [r"\bfever", r"\bhigh temperature\b", r"\bchills\b"],
    "hypothermia": [r"\bhypotherm", r"\bbody is (?:ice|very) cold\b"],
    "active_labour": [r"\bin labou?r\b", r"\blabou?r pains?\b", r"\bcontractions\b", r"\bwaters? (?:has |have )?broke(?:n)?\b"],
    "recent_seizure": [r"\bseizures?\b", r"\bconvulsions?\b", r"\bhad (?:a )?fits?\b", r"\bepilep"],
    "breathing_difficulty": [
        r"\bshort(?:ness)? of breath\b", r"\bbreathless", r"\b(?:difficulty|trouble|problem) breathing\b",
        r"\bhard to breathe\b",
    ],
}

_COMPILED = {flag: [re.compile(p, re.IGNORECASE) for p in pats] for flag, pats in _PATTERNS.items()}
_PREGNANT = re.compile(r"\bpregnan|\bexpecting a baby\b|\bweeks pregnant\b", re.IGNORECASE)


def find_flags(text: str) -> set[str]:
    text = text.replace("’", "'")
    return {flag for flag, pats in _COMPILED.items() if any(p.search(text) for p in pats)}


def mentions_pregnancy(text: str) -> bool:
    return bool(_PREGNANT.search(text))
