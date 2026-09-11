"""Deterministic appointment scheduling: triage level -> priority -> doctor + time.

Pure Python, no I/O, no AI. The Safety Engine decides RED / YELLOW / GREEN;
this module only turns that level, doctor availability, existing bookings and
distance into one explainable choice. Same input -> same output.

Rules
  priority     RED = 1, YELLOW = 2, GREEN = 3
  eligibility  only doctors whose availability_status is "available"
  slot         a doctor's earliest free slot starts at the latest of
                 now + lead time for the level, the doctor's next_available_at,
               rounded up to 5 minutes, then moved past any active booking it
               overlaps
  lead time    RED 0 min (the very next free slot), YELLOW 10 min, GREEN 120 min.
               Routine bookings never take near-term slots, so urgent patients
               do not queue behind them; the first minutes stay open for RED.
  choice       RED     earliest slot wins; slots within 5 minutes of the
                       earliest count as a tie and the closer doctor wins
               YELLOW  lowest  wait_minutes + 2  x distance_km
               GREEN   lowest  wait_minutes + 10 x distance_km (proximity
                       matters more for routine visits); a patient-chosen
                       preferred time is respected for GREEN only
  same level   first come, first served (booking order)
"""
from __future__ import annotations

import math
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

PRIORITY = {"RED": 1, "YELLOW": 2, "GREEN": 3}
PRIORITY_LABEL = {"RED": "Urgent", "YELLOW": "Priority", "GREEN": "Routine"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


LEAD_MINUTES = {
    "RED": _env_int("SCHED_LEAD_RED_MIN", 0),
    "YELLOW": _env_int("SCHED_LEAD_YELLOW_MIN", 10),
    "GREEN": _env_int("SCHED_LEAD_GREEN_MIN", 120),
}
MINUTES_PER_KM = {"RED": 0, "YELLOW": 2, "GREEN": 10}
RED_TIE_MINUTES = 5
STEP_MINUTES = 5
HORIZON = timedelta(days=7)
ACTIVE_STATUSES = ("scheduled", "confirmed", "in_progress")


def parse_dt(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def ceil_to_step(dt: datetime, step: int = STEP_MINUTES) -> datetime:
    dt = dt.replace(second=0, microsecond=0) + (timedelta(minutes=1) if dt.second or dt.microsecond else timedelta())
    extra = (-dt.minute) % step
    return dt + timedelta(minutes=extra)


def earliest_slot(not_before: datetime, busy: list[tuple[datetime, datetime]], duration: timedelta) -> datetime | None:
    """First start >= not_before (on the 5-minute grid) whose [start, start+duration) is free."""
    t = ceil_to_step(not_before)
    busy = sorted(busy)
    moved = True
    while moved:
        moved = False
        for start, end in busy:
            if start < t + duration and end > t:
                t = ceil_to_step(end)
                moved = True
        if t - not_before > HORIZON:
            return None
    return t


@dataclass
class Candidate:
    doctor_id: str
    name: str
    specialization: str | None
    distance_km: float
    availability_status: str
    eligible: bool
    slot: str | None = None        # ISO-8601 UTC
    wait_minutes: int | None = None
    score: float | None = None
    selected: bool = False
    note: str = ""


def plan(level: str, doctors: list[dict], appointments: list[dict], now: datetime,
         patient_lat: float, patient_lng: float, preferred_at: datetime | None = None,
         exclude_slots: set[tuple[str, str]] = frozenset()) -> dict:
    """Choose a doctor and time. Returns a JSON-serialisable decision:
    {level, priority, chosen: Candidate | None, candidates: [...], rule, reason}.
    exclude_slots: (doctor_id, slot ISO) pairs already lost to a concurrent booking."""
    if level not in PRIORITY:
        raise ValueError(f"unknown triage level {level!r}")
    now = parse_dt(now)
    not_before = now + timedelta(minutes=LEAD_MINUTES[level])
    if level == "GREEN" and preferred_at and parse_dt(preferred_at) > not_before:
        not_before = parse_dt(preferred_at)

    busy_by_doctor: dict[str, list[tuple[datetime, datetime]]] = {}
    for a in appointments:
        if a.get("status") not in ACTIVE_STATUSES or not a.get("doctor_id"):
            continue
        start = parse_dt(a["scheduled_at"])
        end = start + timedelta(minutes=int(a.get("duration_minutes") or 15))
        busy_by_doctor.setdefault(a["doctor_id"], []).append((start, end))

    candidates: list[Candidate] = []
    for d in doctors:
        dist = round(haversine_km(patient_lat, patient_lng, float(d["latitude"]), float(d["longitude"])), 1)
        status = d.get("availability_status") or "offline"
        c = Candidate(d["id"], d["name"], d.get("specialization"), dist, status, eligible=False)
        candidates.append(c)
        if status != "available":
            c.note = f"{status} - not accepting patients"
            continue
        duration = timedelta(minutes=int(d.get("slot_minutes") or 15))
        start_from = max(not_before, parse_dt(d.get("next_available_at")) or not_before)
        busy = list(busy_by_doctor.get(d["id"], []))
        slot = earliest_slot(start_from, busy, duration)
        while slot and (d["id"], slot.isoformat()) in exclude_slots:
            busy.append((slot, slot + duration))
            slot = earliest_slot(start_from, busy, duration)
        if slot is None:
            c.note = "no free slot in the next 7 days"
            continue
        c.eligible = True
        c.slot = slot.isoformat()
        c.wait_minutes = max(0, round((slot - now).total_seconds() / 60))
        c.score = round(c.wait_minutes + MINUTES_PER_KM[level] * dist, 1)

    eligible = [c for c in candidates if c.eligible]
    chosen: Candidate | None = None
    if eligible:
        if level == "RED":
            best = min(c.wait_minutes for c in eligible)
            tied = [c for c in eligible if c.wait_minutes <= best + RED_TIE_MINUTES]
            chosen = min(tied, key=lambda c: (c.distance_km, c.wait_minutes, c.name))
        else:
            chosen = min(eligible, key=lambda c: (c.score, c.wait_minutes, c.distance_km, c.name))
        chosen.selected = True

    rule = {
        "RED": "RED - priority 1: earliest available slot; within 5 min the closer doctor wins",
        "YELLOW": "YELLOW - priority 2: earliest reasonable slot (wait + 2 min/km), after the urgent buffer",
        "GREEN": "GREEN - priority 3: routine slot (wait + 10 min/km), proximity weighted",
    }[level]
    return {
        "level": level,
        "priority": PRIORITY[level],
        "rule": rule,
        "chosen": asdict(chosen) if chosen else None,
        "candidates": [asdict(c) for c in sorted(candidates, key=lambda c: (not c.eligible, c.wait_minutes or 0, c.distance_km))],
        "reason": explain(level, chosen, candidates),
    }


def explain(level: str, chosen: Candidate | None, candidates: list[Candidate]) -> str:
    skipped = [c for c in candidates if not c.eligible]
    skipped_text = "; ".join(f"{c.name} ({c.distance_km} km) {c.note}" for c in skipped)
    if not chosen:
        return f"No doctor can take this {level} patient right now" + (f": {skipped_text}." if skipped_text else ".")
    others = [c for c in candidates if c.eligible and not c.selected]
    if level == "RED":
        why = f"{chosen.name} ({chosen.distance_km} km) has the earliest available slot, in {chosen.wait_minutes} min"
        faster_but_farther = [c for c in others if c.wait_minutes is not None and c.wait_minutes <= chosen.wait_minutes + RED_TIE_MINUTES]
        if faster_but_farther:
            why += "; equally early options were farther away"
    else:
        why = (f"{chosen.name} ({chosen.distance_km} km, in {chosen.wait_minutes} min) has the best balance of "
               f"waiting time and distance (score {chosen.score})")
    parts = [why]
    if others:
        parts.append("other options: " + ", ".join(f"{c.name} in {c.wait_minutes} min ({c.distance_km} km)" for c in others))
    if skipped_text:
        parts.append("not considered: " + skipped_text)
    return f"{level} · priority {PRIORITY[level]}. " + ". ".join(parts) + "."
