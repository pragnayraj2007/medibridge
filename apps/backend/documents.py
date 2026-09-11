"""Document pipeline: upload -> OCR (PaddleOCR) -> multimodal analysis (Gemini) -> findings.

Every stage reports its own status so the patient never sits on a spinner and
the doctor sees what worked:
  ocr.status       done | empty | not_configured | failed
  analysis.status  done | not_configured | failed
  status           processed (analysis done) | partial (OCR text only)
                   | empty (nothing readable) | failed

PaddleOCR is too large for a Vercel serverless function, so it runs as its own
service (PaddleOCR / PaddleX serving, `POST /ocr`) at PADDLEOCR_URL. Without it
Gemini reads the image or PDF directly. Gemini findings are information for
the doctor and candidate danger signs for the Safety Engine; they never set
the triage level.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re

import httpx

from safety_engine import VOCABULARY

log = logging.getLogger("medibridge.documents")

MAX_BYTES = 4_000_000  # Vercel caps request bodies at 4.5 MB
ALLOWED_TYPES = {"image/jpeg": "image", "image/png": "image", "image/webp": "image", "application/pdf": "pdf"}
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class DocumentError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def sniff_type(data: bytes, declared: str | None) -> str | None:
    """Trust file bytes over the declared type."""
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate(data: bytes, declared: str | None) -> str:
    if not data:
        raise DocumentError("The file is empty.")
    if len(data) > MAX_BYTES:
        raise DocumentError("That file is too large. Please upload a file under 4 MB.", 413)
    mime = sniff_type(data, declared)
    if mime not in ALLOWED_TYPES:
        raise DocumentError("Unsupported file. Please upload a PDF, JPG, PNG or WEBP.", 415)
    return mime


# ── OCR (PaddleOCR service) ─────────────────────────────────────────────────

def _collect_texts(node) -> list[str]:
    """PaddleOCR/PaddleX serving responses nest recognised lines under rec_texts."""
    out: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "rec_texts" and isinstance(v, list):
                out.extend(str(x) for x in v if str(x).strip())
            else:
                out.extend(_collect_texts(v))
    elif isinstance(node, list):
        for v in node:
            out.extend(_collect_texts(v))
    return out


def run_ocr(data: bytes, mime: str) -> dict:
    url = os.getenv("PADDLEOCR_URL")
    if not url:
        return {"status": "not_configured", "engine": "paddleocr", "text": ""}
    try:
        r = httpx.post(
            url.rstrip("/") + ("" if url.rstrip("/").endswith("/ocr") else "/ocr"),
            json={"file": base64.b64encode(data).decode(), "fileType": 0 if mime == "application/pdf" else 1},
            timeout=25,
        )
        r.raise_for_status()
        body = r.json()
        if body.get("errorCode", 0) not in (0, None):
            raise ValueError(body.get("errorMsg") or "OCR error")
        text = "\n".join(_collect_texts(body.get("result", body))).strip()
        return {"status": "done" if text else "empty", "engine": "paddleocr", "text": text[:20000]}
    except Exception as e:  # timeout, network, bad JSON
        log.warning("PaddleOCR failed: %s", e)
        return {"status": "failed", "engine": "paddleocr", "text": "", "error": type(e).__name__}


# ── Multimodal analysis (Gemini) ────────────────────────────────────────────

GEMINI_PROMPT = """You read a patient's medical document (image or PDF) for a doctor. Extract only what is written; never guess.
{ocr_hint}
Return a JSON object with exactly these keys:
  "readable": true/false (false if blank, not a medical document, or unreadable),
  "document_type": short string (prescription, lab report, discharge summary, scan report, other),
  "document_date": string or null,
  "summary": "1-3 neutral sentences describing what the document records. No diagnosis of your own, no advice, no urgency.",
  "findings": [short strings: key recorded findings],
  "diagnoses_mentioned": [conditions written in the document],
  "medications": [medicines with dose if written],
  "allergies": [allergies if written],
  "lab_results": [{{"name": str, "value": str, "unit": str or null, "flag": "high"|"low"|"normal"|null}}],
  "vitals": {{"hr": num|null, "rr": num|null, "spo2": num|null, "temp": num|null, "sbp": num|null, "dbp": num|null}},
  "patient_age": number or null,
  "pregnancy_mentioned": true/false,
  "danger_signs": [keys from the list below ONLY if the document describes that sign as current / acute; otherwise []]
Allowed danger_signs keys:
{vocab}"""


def analyze(data: bytes, mime: str, ocr_text: str, doc_type: str | None) -> dict:
    key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    if not key:
        return {"status": "not_configured", "model": None, "findings": None}
    hint = f"The patient labelled it: {doc_type}." if doc_type else ""
    if ocr_text:
        hint += f"\nOCR text (may contain errors; the image is authoritative):\n{ocr_text[:6000]}"
    prompt = GEMINI_PROMPT.format(ocr_hint=hint, vocab="\n".join(f"- {k}: {v}" for k, v in VOCABULARY.items()))
    try:
        r = httpx.post(
            GEMINI_URL.format(model=model),
            headers={"x-goog-api-key": key},
            json={
                "contents": [{"parts": [{"text": prompt},
                                        {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}}]}],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
            },
            timeout=30,
        )
        r.raise_for_status()
        parts = r.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
        match = re.search(r"\{.*\}", text, re.DOTALL)
        raw = json.loads(match.group(0) if match else text)
        return {"status": "done", "model": model, "findings": clean_findings(raw)}
    except Exception as e:  # timeout, quota, safety block, invalid JSON
        log.warning("Gemini analysis failed: %s", type(e).__name__)
        return {"status": "failed", "model": model, "findings": None, "error": type(e).__name__}


def _strs(v, limit: int = 30) -> list[str]:
    return [str(x)[:200] for x in v][:limit] if isinstance(v, list) else []


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def clean_findings(raw: dict) -> dict:
    """Keep only the expected keys and types; danger signs limited to the Safety Engine vocabulary."""
    vitals = raw.get("vitals") if isinstance(raw.get("vitals"), dict) else {}
    labs = []
    for item in raw.get("lab_results") or []:
        if isinstance(item, dict) and item.get("name"):
            labs.append({"name": str(item["name"])[:80], "value": str(item.get("value", ""))[:40],
                         "unit": (str(item["unit"])[:20] if item.get("unit") else None),
                         "flag": item.get("flag") if item.get("flag") in ("high", "low", "normal") else None})
    return {
        "readable": raw.get("readable") is not False,
        "document_type": str(raw.get("document_type") or "other")[:60],
        "document_date": (str(raw["document_date"])[:40] if raw.get("document_date") else None),
        "summary": str(raw.get("summary") or "")[:800],
        "findings": _strs(raw.get("findings")),
        "diagnoses_mentioned": _strs(raw.get("diagnoses_mentioned")),
        "medications": _strs(raw.get("medications")),
        "allergies": _strs(raw.get("allergies")),
        "lab_results": labs[:40],
        "vitals": {k: _num(vitals.get(k)) for k in ("hr", "rr", "spo2", "temp", "sbp", "dbp")},
        "patient_age": _num(raw.get("patient_age")),
        "pregnancy_mentioned": raw.get("pregnancy_mentioned") is True,
        "danger_signs": sorted({f for f in _strs(raw.get("danger_signs")) if f in VOCABULARY}),
    }


def process(data: bytes, mime: str, doc_type: str | None) -> dict:
    """OCR then Gemini. Each stage may fail on its own; the overall status says what is usable."""
    ocr = run_ocr(data, mime)
    analysis = analyze(data, mime, ocr.get("text", ""), doc_type)
    findings = analysis.get("findings")
    if analysis["status"] == "done" and findings and findings.get("readable"):
        status = "processed"
    elif analysis["status"] == "done" and findings and not findings.get("readable") and ocr["status"] != "done":
        status = "empty"
    elif ocr["status"] == "done":
        status = "partial"
    elif ocr["status"] == "empty" and analysis["status"] != "done":
        status = "empty"
    else:
        status = "failed"
    return {"status": status, "ocr": ocr, "analysis": analysis}


PATIENT_MESSAGE = {
    "processed": "Document read successfully. Your doctor will see it with your case.",
    "partial": "We read the text of your document. Detailed analysis is unavailable, but your doctor will see it.",
    "empty": "We couldn't find any readable text in this document. Try a clearer photo, or continue without it.",
    "failed": "We couldn't read this document right now. You can try again, or continue without it.",
}


# ── Original file (Supabase Storage, best effort) ───────────────────────────

BUCKET = os.getenv("SUPABASE_DOCUMENTS_BUCKET", "documents")


def _storage_headers() -> dict | None:
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not (os.getenv("SUPABASE_URL") and key):
        return None
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def store_file(path: str, data: bytes, mime: str) -> bool:
    """Upload the original to the private bucket. Failure is logged, never fatal."""
    headers = _storage_headers()
    if not headers:
        return False
    try:
        r = httpx.post(f"{os.environ['SUPABASE_URL'].rstrip('/')}/storage/v1/object/{BUCKET}/{path}",
                       headers={**headers, "Content-Type": mime, "x-upsert": "true"}, content=data, timeout=20)
        if r.status_code >= 400:
            log.warning("Storage upload failed %s: %s", r.status_code, r.text[:200])
            return False
        return True
    except httpx.HTTPError as e:
        log.warning("Storage upload failed: %s", type(e).__name__)
        return False


def signed_url(path: str, expires: int = 600) -> str | None:
    headers = _storage_headers()
    if not headers or not path:
        return None
    base = os.environ["SUPABASE_URL"].rstrip("/") + "/storage/v1"
    try:
        r = httpx.post(f"{base}/object/sign/{BUCKET}/{path}", headers=headers, json={"expiresIn": expires}, timeout=10)
        if r.status_code >= 400:
            return None
        rel = r.json().get("signedURL") or r.json().get("signedUrl")
        return base + rel if rel and rel.startswith("/") else rel
    except (httpx.HTTPError, ValueError):
        return None
