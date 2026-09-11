"""Demo doctors and the demo patient location.

Fictional doctors placed 1.2 km, 2.1 km and 4.0 km from the demo patient
location so "nearest available doctor" is easy to see. The same rows are in
supabase/migrations/002_patients_appointments.sql. The shared demo password is
never stored here, only its PBKDF2 hash.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta

# Patients do not share their location yet: every distance is measured from here.
DEMO_PATIENT_LAT = float(os.getenv("DEMO_PATIENT_LAT", "12.9716"))
DEMO_PATIENT_LNG = float(os.getenv("DEMO_PATIENT_LNG", "77.5946"))

_DEMO_HASH = "pbkdf2_sha256$120000$5130078b92a3f25c4d3c03e553d25118$3b09c874411d4181b7db2c38581e1a32f56b88c6c492feaa4f7c83a031e51fa6"

DOCTORS = [
    {"id": "d0c70000-0000-4000-8000-00000000000a", "name": "Dr. Arjun Mehta", "specialization": "General Medicine",
     "email": "arjun.mehta@medibridge.demo", "latitude": 12.98238, "longitude": 77.5946},     # A: 1.2 km north
    {"id": "d0c70000-0000-4000-8000-00000000000b", "name": "Dr. Ananya Rao", "specialization": "Emergency Medicine",
     "email": "ananya.rao@medibridge.demo", "latitude": 12.9716, "longitude": 77.613959},     # B: 2.1 km east
    {"id": "d0c70000-0000-4000-8000-00000000000c", "name": "Dr. Karan Iyer", "specialization": "Family Medicine",
     "email": "karan.iyer@medibridge.demo", "latitude": 12.935668, "longitude": 77.5946},    # C: 4.0 km south
]

# Demo scenario: A (closest) is busy; B is free in 20 min; C in 45 min.
# A RED patient therefore gets B. Switch A to available and the next patient gets A.
DEMO_STATE = {
    "d0c70000-0000-4000-8000-00000000000a": ("busy", 70),
    "d0c70000-0000-4000-8000-00000000000b": ("available", 20),
    "d0c70000-0000-4000-8000-00000000000c": ("available", 45),
}


def doctor_rows(now: datetime) -> list[dict]:
    rows = []
    for d in DOCTORS:
        status, minutes = DEMO_STATE[d["id"]]
        rows.append({**d, "password_hash": _DEMO_HASH, "availability_status": status,
                     "next_available_at": (now + timedelta(minutes=minutes)).isoformat(), "slot_minutes": 15})
    return rows
