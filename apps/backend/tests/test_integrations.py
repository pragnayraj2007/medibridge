"""Voice + document pipelines with the network mocked (success, failure, timeout, bad JSON).
Run from apps/backend:  python -m unittest discover -s tests -v"""
import base64
import json
import os
import sys
import unittest
from unittest import mock

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import documents  # noqa: E402
import voice  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100
PDF = b"%PDF-1.4 test"


def response(status=200, body=None):
    return httpx.Response(status, content=json.dumps(body or {}).encode(), request=httpx.Request("POST", "https://x"))


def gemini_body(findings):
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(findings)}]}}]}


class DocumentTest(unittest.TestCase):
    def test_validation(self):
        self.assertEqual(documents.validate(PNG, "image/png"), "image/png")
        self.assertEqual(documents.validate(PDF, "application/octet-stream"), "application/pdf")
        for bad in (b"", b"GIF89a....", b"x" * (documents.MAX_BYTES + 1)):
            with self.assertRaises(documents.DocumentError):
                documents.validate(bad, "image/png")

    @mock.patch.dict(os.environ, {}, clear=True)
    def test_nothing_configured(self):
        r = documents.process(PNG, "image/png", "Lab Report")
        self.assertEqual((r["ocr"]["status"], r["analysis"]["status"], r["status"]), ("not_configured", "not_configured", "failed"))

    @mock.patch.dict(os.environ, {"GEMINI_API_KEY": "k", "PADDLEOCR_URL": "http://ocr"}, clear=True)
    def test_full_pipeline(self):
        ocr = {"errorCode": 0, "result": {"ocrResults": [{"prunedResult": {"rec_texts": ["Hb 9.1 g/dL", "Metformin 500"]}}]}}
        findings = {"readable": True, "summary": "Lab report.", "medications": ["Metformin 500 mg"],
                    "danger_signs": ["severe_pallor", "invented"], "lab_results": [{"name": "Hb", "value": "9.1", "unit": "g/dL", "flag": "low"}]}
        with mock.patch.object(httpx, "post", side_effect=[response(200, ocr), response(200, gemini_body(findings))]) as post:
            r = documents.process(PNG, "image/png", "Lab Report")
        self.assertEqual(r["status"], "processed")
        self.assertIn("Hb 9.1", r["ocr"]["text"])
        self.assertEqual(r["analysis"]["findings"]["danger_signs"], ["severe_pallor"])
        self.assertTrue(post.call_args_list[0].args[0].endswith("/ocr"))
        self.assertIn("Hb 9.1", post.call_args_list[1].kwargs["json"]["contents"][0]["parts"][0]["text"])

    @mock.patch.dict(os.environ, {"GEMINI_API_KEY": "k", "PADDLEOCR_URL": "http://ocr"}, clear=True)
    def test_gemini_fails_ocr_survives(self):
        ocr = {"result": {"rec_texts": ["BP 150/95"]}}
        with mock.patch.object(httpx, "post", side_effect=[response(200, ocr), httpx.ReadTimeout("slow")]):
            r = documents.process(PDF, "application/pdf", None)
        self.assertEqual((r["status"], r["analysis"]["status"]), ("partial", "failed"))

    @mock.patch.dict(os.environ, {"GEMINI_API_KEY": "k", "PADDLEOCR_URL": "http://ocr"}, clear=True)
    def test_ocr_fails_gemini_reads_image(self):
        with mock.patch.object(httpx, "post", side_effect=[httpx.ConnectError("down"), response(200, gemini_body({"readable": True, "summary": "x"}))]):
            r = documents.process(PNG, "image/png", None)
        self.assertEqual((r["ocr"]["status"], r["status"]), ("failed", "processed"))

    @mock.patch.dict(os.environ, {"GEMINI_API_KEY": "k"}, clear=True)
    def test_invalid_gemini_json_and_empty_document(self):
        bad = {"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}
        with mock.patch.object(httpx, "post", return_value=response(200, bad)):
            self.assertEqual(documents.process(PNG, "image/png", None)["status"], "failed")
        with mock.patch.object(httpx, "post", return_value=response(200, gemini_body({"readable": False}))):
            self.assertEqual(documents.process(PNG, "image/png", None)["status"], "empty")


class VoiceTest(unittest.TestCase):
    @mock.patch.dict(os.environ, {}, clear=True)
    def test_not_configured(self):
        with self.assertRaises(voice.VoiceError):
            voice.transcribe(b"abc", "a.m4a", "audio/m4a", "en")

    @mock.patch.dict(os.environ, {"SARVAM_API_KEY": "k"}, clear=True)
    def test_transcribe_and_speak(self):
        with mock.patch.object(httpx, "post", return_value=response(200, {"transcript": " chest pain ", "language_code": "en-IN"})) as post:
            self.assertEqual(voice.transcribe(b"abc", "a.m4a", "audio/m4a", "hi")["transcript"], "chest pain")
        self.assertEqual(post.call_args.kwargs["data"], {"model": voice.STT_MODEL, "language_code": "hi-IN"})
        self.assertEqual(post.call_args.kwargs["headers"], {"api-subscription-key": "k"})
        audio = base64.b64encode(b"RIFF").decode()
        with mock.patch.object(httpx, "post", return_value=response(200, {"audios": [audio]})):
            self.assertEqual(voice.speak("hello", "ta")["audio_base64"], audio)

    @mock.patch.dict(os.environ, {"SARVAM_API_KEY": "k"}, clear=True)
    def test_failures(self):
        for effect in (httpx.ReadTimeout("slow"), response(500, {"error": "x"}), response(200, {"transcript": ""})):
            with mock.patch.object(httpx, "post", side_effect=[effect] if isinstance(effect, Exception) else None,
                                   return_value=None if isinstance(effect, Exception) else effect):
                with self.assertRaises(voice.VoiceError):
                    voice.transcribe(b"abc", "a.m4a", "audio/m4a", "en")
        with self.assertRaises(voice.VoiceError):
            voice.transcribe(b"", "a.m4a", "audio/m4a", "en")


if __name__ == "__main__":
    unittest.main()
