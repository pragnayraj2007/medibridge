"""Sarvam AI speech: speech-to-text (Saaras) and text-to-speech (Bulbul).

Called only from the backend; SARVAM_API_KEY never reaches a client. Voice is
optional: every failure raises VoiceError with a patient-safe message and the
app carries on with text.
"""
from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger("medibridge.voice")

SARVAM_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai").rstrip("/")
STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v4")
TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
TTS_SPEAKER = os.getenv("SARVAM_TTS_SPEAKER", "priya")
MAX_AUDIO_BYTES = 3_000_000  # ~30 s of compressed speech; Sarvam REST handles up to 30 s

# App language -> Sarvam BCP-47 code
LANGUAGE_CODES = {"en": "en-IN", "hi": "hi-IN", "te": "te-IN", "ta": "ta-IN", "kn": "kn-IN", "mr": "mr-IN",
                  "bn": "bn-IN", "gu": "gu-IN", "ml": "ml-IN", "pa": "pa-IN", "od": "od-IN"}


class VoiceError(Exception):
    def __init__(self, message: str, status: int = 503):
        super().__init__(message)
        self.status = status


def enabled() -> bool:
    return bool(os.getenv("SARVAM_API_KEY"))


def _headers() -> dict:
    if not enabled():
        raise VoiceError("Voice is not configured on the server. Please type your answer.")
    return {"api-subscription-key": os.environ["SARVAM_API_KEY"]}


def transcribe(data: bytes, filename: str, mime: str | None, language: str) -> dict:
    if not data:
        raise VoiceError("No audio was recorded. Please try again or type your answer.", 400)
    if len(data) > MAX_AUDIO_BYTES:
        raise VoiceError("That recording is too long. Please keep answers under 30 seconds.", 413)
    headers = _headers()
    try:
        r = httpx.post(
            f"{SARVAM_URL}/speech-to-text",
            headers=headers,
            files={"file": (filename or "voice.m4a", data, mime or "application/octet-stream")},
            data={"model": STT_MODEL, "language_code": LANGUAGE_CODES.get(language, "unknown")},
            timeout=30,
        )
    except httpx.HTTPError as e:
        log.warning("Sarvam STT unreachable: %s", type(e).__name__)
        raise VoiceError("Voice service is not reachable right now. Please type your answer.")
    if r.status_code >= 400:
        log.warning("Sarvam STT error %s: %s", r.status_code, r.text[:300])
        raise VoiceError("Could not understand the recording. Please try again or type your answer.", 502)
    body = r.json()
    transcript = (body.get("transcript") or "").strip()
    if not transcript:
        raise VoiceError("No speech was detected. Please try again or type your answer.", 422)
    return {"transcript": transcript, "language_code": body.get("language_code"), "model": STT_MODEL}


def speak(text: str, language: str) -> dict:
    headers = _headers()
    try:
        r = httpx.post(
            f"{SARVAM_URL}/text-to-speech",
            headers=headers,
            json={
                "text": text[:1500],
                "target_language_code": LANGUAGE_CODES.get(language, "en-IN"),
                "model": TTS_MODEL,
                "speaker": TTS_SPEAKER,
                "speech_sample_rate": 16000,
            },
            timeout=30,
        )
    except httpx.HTTPError as e:
        log.warning("Sarvam TTS unreachable: %s", type(e).__name__)
        raise VoiceError("Voice playback is not available right now.")
    if r.status_code >= 400:
        log.warning("Sarvam TTS error %s: %s", r.status_code, r.text[:300])
        raise VoiceError("Voice playback is not available right now.", 502)
    audios = r.json().get("audios") or []
    if not audios:
        raise VoiceError("Voice playback is not available right now.", 502)
    return {"audio_base64": audios[0], "mime": "audio/wav", "model": TTS_MODEL}
