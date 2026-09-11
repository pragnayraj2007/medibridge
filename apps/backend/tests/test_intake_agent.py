"""Intake agent: records brief, one JSON call per question, adaptive prompt, hard limits, fallbacks."""
import json
import os
import sys
import unittest
from unittest import mock

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai  # noqa: E402
import intake_agent  # noqa: E402
from models import Message, Patient  # noqa: E402

PROFILE = {"id": "p1", "sex": "male", "pregnancy_status": "unknown"}
CASES = [{"created_at": "2026-09-05T10:00:00+00:00", "triage_level": "YELLOW",
          "extraction": {"symptoms": ["chest pain"], "duration": "1 day", "medications": ["aspirin"]}}]
DOCS = [{"doc_type": "Lab Report", "analysis": {"findings": {
    "document_type": "lab report", "diagnoses_mentioned": ["type 2 diabetes"], "medications": ["Metformin 500 mg"],
    "lab_results": [{"name": "HbA1c", "value": "8.1", "unit": "%", "flag": "high"}, {"name": "Hb", "value": "14", "unit": "g/dL", "flag": "normal"}]}}}]


def convo(*turns):
    out = []
    for q, a in turns:
        out += [Message(role="assistant", text=q), Message(role="patient", text=a)]
    return out


class BriefTest(unittest.TestCase):
    def test_brief_uses_cases_and_reports(self):
        b = intake_agent.build_brief(PROFILE, CASES, DOCS)
        self.assertIn("chest pain", b)
        self.assertIn("aspirin", b)
        self.assertIn("Metformin 500 mg", b)
        self.assertIn("HbA1c 8.1 % (high)", b)
        self.assertNotIn("Hb 14", b)  # normal labs are left out
        self.assertIn("No records", intake_agent.build_brief(None, [], []))


@mock.patch.dict(os.environ, {"GROQ_API_KEY": "k"})
class AgentTest(unittest.TestCase):
    def reply(self, **kw):
        return json.dumps({"thinking": "rule out spreading pain", "known": {}, "done": False, "question": "", **kw})

    def test_one_call_with_records_and_safety(self):
        with mock.patch.object(ai, "_chat", return_value=self.reply(question="Does the pain spread to your arm or jaw?")) as chat:
            q, source, meta = intake_agent.next_question(
                Patient(age=62, sex="male"), convo(("What brings you in?", "chest pain")), "en", urgent=True,
                brief="Uploaded report - medicines: Metformin", safety_labels=["Acute chest pain, age 62 (>50)"])
        self.assertEqual((q, source), ("Does the pain spread to your arm or jaw?", "groq"))
        self.assertEqual(chat.call_count, 1)
        system, user = chat.call_args.args[0][0]["content"], chat.call_args.args[0][1]["content"]
        self.assertIn("1 left", system)             # urgent: 2 questions max, 1 asked
        self.assertIn("Metformin", user)
        self.assertIn("Acute chest pain", user)
        self.assertEqual(chat.call_args.kwargs["extra"], {"reasoning_effort": "low"})
        self.assertEqual(meta["thinking"], "rule out spreading pain")

    def test_done_and_limits(self):
        with mock.patch.object(ai, "_chat", return_value=self.reply(done=True)):
            self.assertEqual(intake_agent.next_question(Patient(), convo(("q", "a")))[0], ai.DONE_MESSAGE)
        with mock.patch.object(ai, "_chat") as chat:  # limit reached: no AI call at all
            q, _, _ = intake_agent.next_question(Patient(), convo(*[("q", "a")] * 4))
            self.assertEqual(q, ai.DONE_MESSAGE)
            chat.assert_not_called()
        with mock.patch.object(ai, "_chat", return_value=self.reply(done=True)):  # can't finish before any answer
            self.assertNotEqual(intake_agent.next_question(Patient(), [])[0], ai.DONE_MESSAGE)

    def test_invalid_output_falls_back(self):
        for bad in ("not json", json.dumps({"question": ""})):
            with mock.patch.object(ai, "_chat", return_value=bad):
                q, source, _ = intake_agent.next_question(Patient(), convo(("q", "a")))
                self.assertEqual((q, source), (ai.FALLBACK_QUESTIONS[1], "rules"))
        with mock.patch.object(ai, "_chat", side_effect=httpx.ReadTimeout("slow")):
            self.assertEqual(intake_agent.next_question(Patient(), [])[1], "rules")

    def test_chat_retries_without_rejected_param(self):
        ok = httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]}, request=httpx.Request("POST", "https://x"))
        bad = httpx.Response(400, json={"error": "unknown param"}, request=httpx.Request("POST", "https://x"))
        with mock.patch.object(httpx, "post", side_effect=[bad, ok]) as post:
            self.assertEqual(ai._chat([], json_mode=True, extra={"reasoning_effort": "low"}), "{}")
        self.assertIn("reasoning_effort", post.call_args_list[0].kwargs["json"])
        self.assertNotIn("reasoning_effort", post.call_args_list[1].kwargs["json"])


if __name__ == "__main__":
    unittest.main()


@mock.patch.dict(os.environ, {"GROQ_API_KEY": "k"})
class LateFailureTest(unittest.TestCase):
    def test_finish_instead_of_switching_to_scripted_questions(self):
        with mock.patch.object(ai, "_chat", return_value="not json"):
            q, _, _ = intake_agent.next_question(Patient(), convo(("q1", "a1"), ("q2", "a2")), "hi")
        self.assertEqual(q, ai.DONE_MESSAGE)

    def test_brief_is_lazy(self):
        loader = mock.Mock(return_value="records")
        intake_agent.next_question(Patient(), convo(*[("q", "a")] * 4), brief=loader)  # at the limit: no AI, no load
        loader.assert_not_called()
