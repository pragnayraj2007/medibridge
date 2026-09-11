"""MediBridge OCR service: PaddleOCR 3.x behind a small HTTP API (deployed on Modal: modal_app.py; the Dockerfile runs it anywhere else).

POST /ocr  {"file": "<base64>", "fileType": 0 (PDF) | 1 (image)}
           Authorization: Bearer <OCR_TOKEN>
-> {"errorCode": 0, "errorMsg": "Success", "result": {"ocrResults": [{"prunedResult": {"rec_texts": [...]}}]}}

Same response shape as PaddleOCR/PaddleX serving, so the MediBridge backend reads it
unchanged. Text only: no document is stored; the temp file is deleted after each call.
"""
from __future__ import annotations

import base64
import binascii
import hmac
import logging
import os
import tempfile
import threading
import time

from fastapi import FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

log = logging.getLogger("ocr")
logging.basicConfig(level=logging.INFO)

MAX_BYTES = 6_000_000
TOKEN = os.getenv("OCR_TOKEN", "")

app = FastAPI(title="MediBridge OCR", docs_url=None, redoc_url=None)
_ocr = None
_lock = threading.Lock()  # one PaddleOCR instance, one request at a time


def get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR
        _ocr = PaddleOCR(
            # Mobile models: fast on a small CPU, good accuracy for printed reports
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return _ocr


class OcrIn(BaseModel):
    file: str
    fileType: int = 1


def _suffix(data: bytes, file_type: int) -> str:
    if data.startswith(b"%PDF") or file_type == 0:
        return ".pdf"
    if data.startswith(b"\x89PNG"):
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".jpg"


def _run(data: bytes, suffix: str) -> list[str]:
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        with _lock:
            results = get_ocr().predict(path)
        texts: list[str] = []
        for res in results:  # one result per image / PDF page
            texts.extend(str(t) for t in (res["rec_texts"] or []) if str(t).strip())
        return texts
    finally:
        os.remove(path)


@app.get("/")
def health():
    return {"status": "ok", "service": "medibridge-ocr", "model_loaded": _ocr is not None}


@app.post("/ocr")
async def ocr(body: OcrIn, authorization: str | None = Header(None)):
    if TOKEN and not hmac.compare_digest(authorization or "", f"Bearer {TOKEN}"):
        raise HTTPException(401, "unauthorized")
    try:
        data = base64.b64decode(body.file, validate=True)
    except (binascii.Error, ValueError):
        return {"errorCode": 400, "errorMsg": "file must be base64"}
    if not data or len(data) > MAX_BYTES:
        return {"errorCode": 413, "errorMsg": "empty or too large"}
    started = time.time()
    try:
        texts = await run_in_threadpool(_run, data, _suffix(data, body.fileType))
    except Exception as e:  # unreadable file, model error
        log.warning("OCR failed: %s", e)
        return {"errorCode": 500, "errorMsg": f"OCR failed: {type(e).__name__}"}
    log.info("OCR %d bytes -> %d lines in %.1fs", len(data), len(texts), time.time() - started)
    return {"errorCode": 0, "errorMsg": "Success", "result": {"ocrResults": [{"prunedResult": {"rec_texts": texts}}]}}
