"""HTTP-level test of the FastAPI routes on the in-memory store (skipped if FastAPI is not installed).
Run from apps/backend:  python -m unittest discover -s tests -v"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for key in ("GROQ_API_KEY", "GEMINI_API_KEY", "SARVAM_API_KEY", "PADDLEOCR_URL", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
    os.environ[key] = ""  # empty values win over .env (load_dotenv does not override)

try:
    from fastapi.testclient import TestClient
    import main
    HAVE_FASTAPI = True
except ImportError:  # the cloud sandbox has no FastAPI
    HAVE_FASTAPI = False

DEMO_PASSWORD = os.getenv("MEDIBRIDGE_DEMO_PASSWORD")
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@unittest.skipUnless(HAVE_FASTAPI, "FastAPI not installed")
class ApiTest(unittest.TestCase):
    def setUp(self):
        from storage import MemoryStore
        main.store = MemoryStore()
        self.c = TestClient(main.app)
        r = self.c.post("/patients", json={"name": "Api Test", "age": 62, "sex": "male", "language": "en"})
        self.assertEqual(r.status_code, 201, r.text)
        body = r.json()
        self.code = body["patient"]["patient_code"]
        self.P = {"X-Patient-Code": self.code, "X-Patient-Token": body["token"]}

    def doctor(self):
        if not DEMO_PASSWORD:
            self.skipTest("MEDIBRIDGE_DEMO_PASSWORD not set")
        r = self.c.post("/auth/login", json={"email": "ananya.rao@medibridge.demo", "password": DEMO_PASSWORD})
        self.assertEqual(r.status_code, 200, r.text)
        return {"Authorization": f"Bearer {r.json()['token']}"}

    def test_health_and_qr(self):
        self.assertEqual(self.c.get("/health").json()["storage"], "memory")
        p = self.c.get(f"/patients/{self.code}", headers=self.P).json()
        self.assertTrue(p["qr"].startswith("data:image/png;base64,"))

    def test_patient_auth(self):
        self.assertEqual(self.c.get(f"/patients/{self.code}").status_code, 401)
        self.assertEqual(self.c.get(f"/patients/{self.code}", headers={"X-Patient-Token": "wrong"}).status_code, 401)
        self.assertEqual(self.c.post("/cases", json={"messages": [{"role": "patient", "text": "hi"}]}).status_code, 401)

    def test_doctor_endpoints_need_login(self):
        for path in ("/cases", "/doctors", "/appointments"):
            self.assertEqual(self.c.get(path).status_code, 401, path)
        self.assertEqual(self.c.post("/auth/login", json={"email": "ananya.rao@medibridge.demo", "password": "nope"}).status_code, 401)

    def test_full_flow(self):
        D = self.doctor()
        self.c.post("/demo/reset", json={"cancel_upcoming": False}, headers=D)
        r = self.c.post("/cases", headers=self.P, json={"patient": {"age": 62, "sex": "male"}, "language": "en", "messages": [
            {"role": "assistant", "text": "What brings you in?"}, {"role": "patient", "text": "chest pain since morning", "via": "voice"}]})
        self.assertEqual(r.status_code, 201, r.text)
        case = r.json()
        self.assertEqual(case["triage_level"], "RED")
        self.assertEqual(case["appointment"]["doctor"]["name"], "Dr. Ananya Rao")
        listed = self.c.get("/cases", headers=D).json()
        self.assertEqual(listed[0]["appointment"]["id"], case["appointment"]["id"])
        detail = self.c.get(f"/cases/{case['id']}", headers=D).json()
        self.assertEqual(detail["patient_code"], self.code)
        aid = case["appointment"]["id"]
        self.assertEqual(self.c.patch(f"/appointments/{aid}", json={"status": "completed"}, headers=D).status_code, 409)
        self.assertEqual(self.c.patch(f"/appointments/{aid}", json={"status": "in_progress"}, headers=D).json()["status"], "in_progress")
        self.c.patch("/doctors/d0c70000-0000-4000-8000-00000000000a/availability", json={"availability_status": "available"}, headers=D)
        again = self.c.post("/cases", headers=self.P, json={"messages": [{"role": "patient", "text": "chest pain again"}]}).json()
        self.assertEqual(again["appointment"]["doctor"]["name"], "Dr. Arjun Mehta")
        mine = self.c.get(f"/patients/{self.code}/cases", headers=self.P).json()
        self.assertEqual(len(mine), 2)
        self.assertNotIn("summary", mine[0])

    def test_voice_and_documents_fall_back(self):
        r = self.c.post("/voice/transcribe", headers=self.P, files={"file": ("v.m4a", b"abc", "audio/mp4")}, data={"language": "hi"})
        self.assertEqual(r.status_code, 503)
        self.assertIn("type", r.json()["detail"].lower())
        r = self.c.post("/documents", headers=self.P, files={"file": ("x.gif", b"GIF89a", "image/gif")})
        self.assertEqual(r.status_code, 415)
        r = self.c.post("/documents", headers=self.P, files={"file": ("lab.png", PNG, "image/png")}, data={"doc_type": "Lab Report"})
        self.assertEqual(r.status_code, 201, r.text)
        doc = r.json()
        self.assertEqual((doc["status"], doc["ocr_status"], doc["analysis_status"]), ("failed", "not_configured", "not_configured"))
        case = self.c.post("/cases", headers=self.P, json={"messages": [{"role": "patient", "text": "mild cough"}], "document_ids": [doc["id"]]}).json()
        self.assertEqual(case["documents"][0]["id"], doc["id"])
        self.assertEqual(len(self.c.get(f"/patients/{self.code}/documents", headers=self.P).json()), 1)

    def test_base64_json_uploads(self):
        import base64
        b64 = lambda b: base64.b64encode(b).decode()
        r = self.c.post("/voice/transcribe-json", json={"audio_base64": b64(b"abc"), "language": "te"})
        self.assertEqual(r.status_code, 401)  # needs the patient token
        r = self.c.post("/voice/transcribe-json", headers=self.P, json={"audio_base64": b64(b"abc"), "mime": "audio/mp4", "language": "te"})
        self.assertEqual(r.status_code, 503)  # no Sarvam key in tests: same message as multipart
        r = self.c.post("/voice/transcribe-json", headers=self.P, json={"audio_base64": "not base64!!"})
        self.assertEqual(r.status_code, 400)
        r = self.c.post("/documents/json", headers=self.P, json={"file_base64": b64(b"GIF89a"), "filename": "x.gif", "mime": "image/gif"})
        self.assertEqual(r.status_code, 415)
        r = self.c.post("/documents/json", headers=self.P, json={"file_base64": "data:image/png;base64," + b64(PNG),
                                                                 "filename": "lab.png", "mime": "image/png", "doc_type": "Lab Report"})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json()["name"], "lab.png")


if __name__ == "__main__":
    unittest.main()
