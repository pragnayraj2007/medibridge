"""Scheduling, fusion, auth and the end-to-end case flow on the in-memory store.

Run from apps/backend:  python -m unittest discover -s tests -v
No network: AI keys are removed so Groq/Gemini/Sarvam fall back to rules.
"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for key in ("GROQ_API_KEY", "GEMINI_API_KEY", "SARVAM_API_KEY", "PADDLEOCR_URL", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
    os.environ.pop(key, None)

import auth  # noqa: E402
import fusion  # noqa: E402
import scheduling  # noqa: E402
import service  # noqa: E402
from models import CaseCreate  # noqa: E402
from seed import DEMO_PATIENT_LAT as LAT, DEMO_PATIENT_LNG as LNG  # noqa: E402
from storage import Conflict, MemoryStore  # noqa: E402

NOW = datetime(2026, 9, 11, 13, 0, tzinfo=timezone.utc)  # 18:30 IST
A, B, C = ("d0c70000-0000-4000-8000-00000000000" + x for x in "abc")


def doctors(a=("busy", 70), b=("available", 20), c=("available", 45)):
    rows = []
    for (doc_id, lat, lng, name), (status, mins) in zip(
        [(A, 12.98238, 77.5946, "Dr A"), (B, 12.9716, 77.613959, "Dr B"), (C, 12.935668, 77.5946, "Dr C")], [a, b, c]
    ):
        rows.append({"id": doc_id, "name": name, "latitude": lat, "longitude": lng, "availability_status": status,
                     "next_available_at": (NOW + timedelta(minutes=mins)).isoformat() if mins is not None else None,
                     "slot_minutes": 15})
    return rows


def plan(level, docs, appts=(), **kw):
    return scheduling.plan(level, docs, list(appts), NOW, LAT, LNG, **kw)


class SchedulingTest(unittest.TestCase):
    def test_distances(self):
        d = {c["name"]: c["distance_km"] for c in plan("RED", doctors())["candidates"]}
        self.assertEqual(d, {"Dr A": 1.2, "Dr B": 2.1, "Dr C": 4.0})

    def test_red_gets_earliest_not_closest_busy(self):
        p = plan("RED", doctors())
        self.assertEqual(p["chosen"]["name"], "Dr B")
        self.assertEqual(p["chosen"]["wait_minutes"], 20)
        self.assertEqual(p["priority"], 1)
        self.assertIn("busy", p["reason"])

    def test_red_earliest_beats_closer(self):
        # A available but only in 60 min; C (farther) in 30 min -> C
        p = plan("RED", doctors(a=("available", 60), b=("offline", None), c=("available", 30)))
        self.assertEqual(p["chosen"]["name"], "Dr C")

    def test_red_tie_goes_to_closer(self):
        p = plan("RED", doctors(a=("available", 23), b=("available", 20), c=("available", 20)))
        self.assertEqual(p["chosen"]["name"], "Dr A")  # within 5 min of the earliest, and closest

    def test_availability_change_reassigns(self):
        before = plan("RED", doctors())
        after = plan("RED", doctors(a=("available", None)))
        self.assertEqual(before["chosen"]["name"], "Dr B")
        self.assertEqual(after["chosen"]["name"], "Dr A")
        self.assertEqual(after["chosen"]["wait_minutes"], 0)

    def test_existing_bookings_push_slot(self):
        appts = [{"doctor_id": B, "scheduled_at": (NOW + timedelta(minutes=20)).isoformat(), "duration_minutes": 15, "status": "confirmed"}]
        p = plan("RED", doctors(), appts)
        # B next free at +35, C at +45 -> still B (earliest)
        self.assertEqual((p["chosen"]["name"], p["chosen"]["wait_minutes"]), ("Dr B", 35))
        appts.append({"doctor_id": B, "scheduled_at": (NOW + timedelta(minutes=35)).isoformat(), "duration_minutes": 15, "status": "scheduled"})
        p = plan("RED", doctors(), appts)
        # B at +50 vs C at +45: within the 5-minute tie window, so the closer B still wins
        self.assertEqual((p["chosen"]["name"], p["chosen"]["wait_minutes"]), ("Dr B", 50))
        appts.append({"doctor_id": B, "scheduled_at": (NOW + timedelta(minutes=50)).isoformat(), "duration_minutes": 15, "status": "scheduled"})
        p = plan("RED", doctors(), appts)
        self.assertEqual((p["chosen"]["name"], p["chosen"]["wait_minutes"]), ("Dr C", 45))

    def test_cancelled_bookings_free_the_slot(self):
        appts = [{"doctor_id": B, "scheduled_at": (NOW + timedelta(minutes=20)).isoformat(), "duration_minutes": 15, "status": "cancelled"}]
        self.assertEqual(plan("RED", doctors(), appts)["chosen"]["wait_minutes"], 20)

    def test_priority_order_red_yellow_green(self):
        docs = doctors(a=("available", None), b=("available", None), c=("available", None))
        red, yellow, green = (plan(lvl, docs)["chosen"] for lvl in ("RED", "YELLOW", "GREEN"))
        self.assertLess(red["wait_minutes"], yellow["wait_minutes"])
        self.assertLess(yellow["wait_minutes"], green["wait_minutes"])
        self.assertEqual(green["wait_minutes"], 120)

    def test_green_not_ahead_of_yellow_in_near_term(self):
        # 10 routine bookings already exist; they all start >= 2 h out, so YELLOW still gets a near slot
        docs = doctors(a=("available", None), b=("available", None), c=("available", None))
        greens = []
        for _ in range(10):
            ch = plan("GREEN", docs, greens)["chosen"]
            greens.append({"doctor_id": ch["doctor_id"], "scheduled_at": ch["slot"], "duration_minutes": 15, "status": "scheduled"})
        self.assertLessEqual(plan("YELLOW", docs, greens)["chosen"]["wait_minutes"], 15)

    def test_green_prefers_proximity_and_preferred_time(self):
        docs = doctors(a=("available", None), b=("available", None), c=("available", None))
        self.assertEqual(plan("GREEN", docs)["chosen"]["name"], "Dr A")
        pref = NOW + timedelta(days=1, hours=2)
        self.assertEqual(scheduling.parse_dt(plan("GREEN", docs, preferred_at=pref)["chosen"]["slot"]), pref)
        # preferred time is ignored for RED
        self.assertEqual(plan("RED", docs, preferred_at=pref)["chosen"]["wait_minutes"], 0)

    def test_no_doctor(self):
        p = plan("RED", doctors(a=("busy", 10), b=("offline", None), c=("busy", 5)))
        self.assertIsNone(p["chosen"])
        self.assertIn("No doctor", p["reason"])

    def test_deterministic(self):
        self.assertEqual(plan("YELLOW", doctors()), plan("YELLOW", doctors()))


class AuthTest(unittest.TestCase):
    def test_password(self):
        h = auth.hash_password("pw", iterations=1000)
        self.assertTrue(auth.verify_password("pw", h))
        self.assertFalse(auth.verify_password("nope", h))
        self.assertFalse(auth.verify_password("pw", None))

    def test_token(self):
        t = auth.issue_token("doc1", "Dr X", now=1000)
        self.assertEqual(auth.verify_token(t, now=1001)["sub"], "doc1")
        self.assertIsNone(auth.verify_token(t, now=1000 + auth.TOKEN_TTL_SECONDS + 1))
        body, sig = t.split(".")
        self.assertIsNone(auth.verify_token(body + "." + sig[::-1], now=1001))
        self.assertIsNone(auth.verify_token("garbage"))

    def test_patient_code(self):
        code = auth.new_patient_code()
        self.assertRegex(code, r"^PAT-[0-9A-F]{8}$")
        tok = auth.new_patient_token()
        self.assertTrue(auth.patient_token_matches(tok, auth.hash_patient_token(tok)))
        self.assertFalse(auth.patient_token_matches("x", auth.hash_patient_token(tok)))


class FusionTest(unittest.TestCase):
    def test_conflicts_are_kept(self):
        prev = [{"id": "11111111-2222-3333-4444-555555555555", "created_at": (NOW - timedelta(days=3)).isoformat(),
                 "triage_level": "YELLOW", "extraction": {"symptoms": ["chest pain"], "duration": "1 day"}, "summary": "..."}]
        doc = {"id": "d1", "name": "discharge.pdf", "status": "processed",
               "analysis": {"status": "done", "findings": {"medications": ["Atorvastatin 20 mg"], "allergies": ["penicillin"],
                                                           "patient_age": 48, "pregnancy_mentioned": False,
                                                           "danger_signs": ["chest_pain", "made_up_flag"]}}}
        ctx = fusion.build_context(
            {"patient_code": "PAT-1", "age": 62, "pregnancy_status": "unknown"}, {"age": 62, "sex": "male"},
            {"symptoms": ["chest pain"], "duration": "started today", "medications": [], "allergies": [], "history": []},
            [{"role": "patient", "text": "chest pain since morning", "via": "voice"}], [doc], prev, None, NOW)
        fields = {(c["field"], c["kind"]) for c in ctx["conflicts"]}
        self.assertIn(("timeline", "conflict"), fields)
        self.assertIn(("age", "conflict"), fields)
        self.assertIn(("medications", "unconfirmed"), fields)
        self.assertIn(("allergies", "unconfirmed"), fields)
        self.assertEqual(ctx["voice_transcripts"], ["chest pain since morning"])
        self.assertIn("previous_cases", ctx["sources"])
        timeline = next(c for c in ctx["conflicts"] if c["field"] == "timeline")
        self.assertIn("started today", timeline["statements"][0]["value"])
        self.assertIn("1 day", timeline["statements"][1]["value"])
        from safety_engine import VOCABULARY
        self.assertEqual(fusion.document_flags([doc], VOCABULARY), {"chest_pain": ["discharge.pdf"]})


def case_body(text, **patient):
    return CaseCreate(patient=patient, language="en", messages=[
        {"role": "assistant", "text": "What brings you in today?"}, {"role": "patient", "text": text}])


class EndToEndTest(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore()
        service.reset_demo(self.store, cancel_upcoming=False, now=NOW)

    def register(self, **kw):
        data = {"name": "Test", "phone": None, "age": 62, "sex": "male", "pregnancy_status": "unknown", "language": "en", **kw}
        patient, token = service.register_patient(self.store, data)
        return service.find_patient(self.store, patient["patient_code"]), token

    def test_patient_id_is_persistent(self):
        p, token = self.register()
        again = service.find_patient(self.store, p["patient_code"].lower())
        self.assertEqual(again["id"], p["id"])
        self.assertTrue(auth.patient_token_matches(token, again["token_hash"]))
        c1 = service.create_case(self.store, case_body("mild cough"), p, NOW)
        c2 = service.create_case(self.store, case_body("mild cough again"), p, NOW)
        self.assertEqual(c1["patient_id"], c2["patient_id"])
        self.assertEqual(len(service.patient_cases(self.store, p)), 2)
        # previous case feeds the second case's fused context
        self.assertEqual(len(c2["fused_context"]["previous_cases"]), 1)

    def test_red_flow_books_earliest_doctor(self):
        p, _ = self.register()
        c = service.create_case(self.store, case_body("I have chest pain since this morning"), p, NOW)
        self.assertEqual(c["triage_level"], "RED")
        self.assertEqual(c["triage"]["decided_by"], "safety_engine")
        a = c["appointment"]
        self.assertEqual(a["doctor"]["name"], "Dr. Ananya Rao")  # B: earliest; A is busy
        self.assertEqual(a["priority"], 1)
        self.assertEqual(a["status"], "confirmed")
        self.assertEqual(scheduling.parse_dt(a["scheduled_at"]), NOW + timedelta(minutes=20))
        # persisted and visible to both sides
        self.assertEqual(service.patient_appointments(self.store, p)[0]["id"], a["id"])
        listed = service.list_cases(self.store, None, None, 10)[0]
        self.assertEqual(listed["appointment"]["id"], a["id"])
        self.assertEqual(listed["patient_code"], p["patient_code"])
        detail = service.get_case(self.store, c["id"])
        self.assertTrue(detail["summary"])
        self.assertIn("candidates", detail["appointment"]["assignment"])

    def test_availability_demo(self):
        p, _ = self.register()
        first = service.create_case(self.store, case_body("chest pain"), p, NOW)["appointment"]
        service.set_availability(self.store, A, "available", None, NOW)
        second = service.create_case(self.store, case_body("chest pain"), p, NOW)["appointment"]
        self.assertEqual(first["doctor"]["name"], "Dr. Ananya Rao")
        self.assertEqual(second["doctor"]["name"], "Dr. Arjun Mehta")

    def test_levels_and_green_rebook(self):
        p, _ = self.register(age=30)
        yellow = service.create_case(self.store, case_body("I fainted this morning"), p, NOW)
        green = service.create_case(self.store, case_body("I have a mild cough"), p, NOW)
        self.assertEqual((yellow["triage_level"], green["triage_level"]), ("YELLOW", "GREEN"))
        self.assertEqual((yellow["appointment"]["priority"], green["appointment"]["priority"]), (2, 3))
        self.assertLess(yellow["appointment"]["scheduled_at"], green["appointment"]["scheduled_at"])
        pref = NOW + timedelta(days=1, hours=4)
        moved = service.rebook_routine(self.store, p, green["id"], pref, NOW)
        self.assertEqual(scheduling.parse_dt(moved["scheduled_at"]), pref)
        statuses = sorted(a["status"] for a in service.patient_appointments(self.store, p) if a["case_id"] == green["id"])
        self.assertEqual(statuses, ["cancelled", "scheduled"])
        with self.assertRaises(service.Invalid):
            service.rebook_routine(self.store, p, yellow["id"], pref, NOW)

    def test_ai_cannot_downgrade_red(self):
        # Even with no AI flags (rules mode) the keyword engine keeps RED
        p, _ = self.register()
        c = service.create_case(self.store, case_body("my lips are blue and I feel dizzy"), p, NOW)
        self.assertEqual(c["triage_level"], "RED")

    def test_lifecycle(self):
        p, _ = self.register(age=30)
        a = service.create_case(self.store, case_body("mild cough"), p, NOW)["appointment"]
        with self.assertRaises(service.Invalid):
            service.set_appointment_status(self.store, a["id"], "completed")
        for s in ("confirmed", "in_progress", "completed"):
            self.assertEqual(service.set_appointment_status(self.store, a["id"], s)["status"], s)

    def test_no_doctor_means_no_fake_appointment(self):
        for d in (A, B, C):
            service.set_availability(self.store, d, "offline", None, NOW)
        p, _ = self.register()
        c = service.create_case(self.store, case_body("chest pain"), p, NOW)
        self.assertIsNone(c["appointment"])
        self.assertEqual(c["appointment_error"], "no_doctor_available")
        self.assertEqual(service.patient_appointments(self.store, p), [])

    def test_double_booking_blocked(self):
        p, _ = self.register()
        slot = (NOW + timedelta(minutes=20)).isoformat()
        self.store.insert("appointments", {"patient_id": p["id"], "doctor_id": B, "case_id": None, "scheduled_at": slot,
                                           "duration_minutes": 15, "triage_level": "RED", "priority": 1, "status": "confirmed"})
        with self.assertRaises(Conflict):
            self.store.insert("appointments", {"patient_id": p["id"], "doctor_id": B, "case_id": None, "scheduled_at": slot,
                                               "duration_minutes": 15, "triage_level": "RED", "priority": 1, "status": "confirmed"})

    def test_patient_view_hides_ai_details(self):
        p, _ = self.register()
        c = service.create_case(self.store, case_body("chest pain"), p, NOW)
        view = service.patient_case(self.store, p, c["id"])
        self.assertNotIn("summary", view)
        self.assertNotIn("fused_context", view)
        other, _ = self.register()
        with self.assertRaises(service.NotFound):
            service.patient_case(self.store, other, c["id"])


if __name__ == "__main__":
    unittest.main()


class IntakeLengthTest(unittest.TestCase):
    def msgs(self, n_asked, answer="mild cough"):
        from models import Message
        out = []
        for i in range(n_asked):
            out += [Message(role="assistant", text=f"q{i}"), Message(role="patient", text=answer)]
        return out

    def test_short_interview(self):
        import ai
        from models import Patient
        self.assertEqual(ai.MAX_QUESTIONS, 4)
        asked = [ai.next_question(Patient(), self.msgs(n))[0] for n in range(5)]
        self.assertEqual(asked[:4], ai.FALLBACK_QUESTIONS)
        self.assertEqual(asked[4], ai.DONE_MESSAGE)

    def test_urgent_interview_is_shorter(self):
        import ai
        from models import Patient
        self.assertNotEqual(ai.next_question(Patient(), self.msgs(1), urgent=True)[0], ai.DONE_MESSAGE)
        self.assertEqual(ai.next_question(Patient(), self.msgs(2), urgent=True)[0], ai.DONE_MESSAGE)
