"""Run from apps/backend:  python -m unittest discover -s tests -v"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from keywords import find_flags, mentions_pregnancy  # noqa: E402
from safety_engine import GREEN, RED, VOCABULARY, YELLOW, TriageInput, Vitals, triage  # noqa: E402


def level(flags=(), age=None, pregnant=False, **vitals):
    return triage(TriageInput(set(flags), age, pregnant, Vitals(**vitals))).level


def level_from_text(text, age=None, pregnant=False):
    return level(find_flags(text), age, pregnant or mentions_pregnancy(text))


class EngineTest(unittest.TestCase):
    def test_no_findings_is_green(self):
        self.assertEqual(level(age=30), GREEN)

    def test_single_red_flags(self):
        for flag in ("respiratory_distress", "heavy_bleeding", "snake_bite", "unresponsive", "poisoning"):
            self.assertEqual(level({flag}, age=30), RED, flag)

    def test_single_yellow_flags(self):
        for flag in ("wheezing", "recent_fainting", "severe_pain", "acute_focal_neuro"):
            self.assertEqual(level({flag}, age=30), YELLOW, flag)

    def test_chest_pain_depends_on_age(self):
        self.assertEqual(level({"chest_pain"}, age=61), RED)
        self.assertEqual(level({"chest_pain"}, age=34), YELLOW)
        self.assertEqual(level({"chest_pain"}, age=None), RED)  # unknown age is conservative

    def test_pregnancy_danger_signs(self):
        self.assertEqual(level({"severe_headache"}, age=28, pregnant=True), RED)
        self.assertEqual(level({"active_labour"}, age=28, pregnant=True), RED)
        self.assertEqual(level(age=28, pregnant=True, sbp=165), RED)
        self.assertEqual(level(age=28, pregnant=True, sbp=120, dbp=80), GREEN)
        self.assertEqual(level({"severe_headache"}, age=28), YELLOW)

    def test_two_of_meningism_signs(self):
        self.assertEqual(level({"fever", "headache"}, age=25), RED)
        self.assertEqual(level({"headache"}, age=25, temp=39.5), RED)
        self.assertEqual(level({"fever"}, age=25), GREEN)

    def test_vital_signs(self):
        self.assertEqual(level(age=40, hr=160), RED)
        self.assertEqual(level(age=40, hr=45), RED)
        self.assertEqual(level(age=40, hr=135), YELLOW)
        self.assertEqual(level(age=40, spo2=90), YELLOW)
        self.assertEqual(level(age=40, rr=34), YELLOW)
        self.assertEqual(level(age=40, hr=80, rr=16, spo2=98, temp=37), GREEN)

    def test_children_never_auto_green(self):
        self.assertEqual(level(age=8), YELLOW)

    def test_unknown_flags_are_ignored(self):
        self.assertEqual(level({"made_up_flag", "diagnosis_mi"}, age=30), GREEN)

    def test_reasons_listed_red_first(self):
        result = triage(TriageInput({"wheezing", "snake_bite"}, 30))
        self.assertEqual([r.level for r in result.reasons], [RED, YELLOW])

    def test_deterministic(self):
        inp = TriageInput({"chest_pain", "fever", "headache"}, 55, False, Vitals(hr=140))
        self.assertEqual(triage(inp).to_dict(), triage(inp).to_dict())


class KeywordTest(unittest.TestCase):
    def test_every_keyword_flag_is_in_vocabulary(self):
        from keywords import _PATTERNS
        self.assertFalse(set(_PATTERNS) - set(VOCABULARY))

    def test_red_phrases(self):
        self.assertEqual(level_from_text("I can't breathe properly", age=30), RED)
        self.assertEqual(level_from_text("My son was bitten by a snake", age=30), RED)
        self.assertEqual(level_from_text("I was hit by a bus this morning", age=30), RED)
        self.assertEqual(level_from_text("I’m 30 weeks pregnant with a severe headache", age=29), RED)

    def test_demo_case_is_yellow(self):
        text = "Chest tightness and shortness of breath, feeling tired for 3 days"
        self.assertEqual(level_from_text(text, age=34), YELLOW)

    def test_benign_text_is_green(self):
        self.assertEqual(level_from_text("I have a mild cough and runny nose since yesterday", age=30), GREEN)

    def test_false_positive_guards(self):
        self.assertNotIn("high_risk_trauma", find_flags("I had a flu shot last week"))
        self.assertNotIn("trauma_or_burns", find_flags("I get heartburn and can't fall asleep"))
        self.assertNotIn("poisoning", find_flags("I think it is food poisoning"))
        self.assertNotIn("acute_visual_disturbance", find_flags("I can't see a doctor until Monday"))


if __name__ == "__main__":
    unittest.main()
