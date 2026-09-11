"""Demo-grade authentication. Standard library only.

Doctors: email + password (PBKDF2-SHA256 hash in the doctors table) -> a signed,
expiring bearer token (HMAC-SHA256). This is hackathon auth, not production
healthcare auth: no refresh tokens, no lockout, no MFA.

Patients: no password. On registration the backend returns a random device token;
only its SHA-256 hash is stored. The token proves "this is the device that
registered this patient" and is required to read the patient's history. The
patient code (PAT-XXXXXXXX) on the QR code is an identifier only, never a
credential.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

PBKDF2_ITERATIONS = 120_000
TOKEN_TTL_SECONDS = 12 * 3600

# Used only when neither AUTH_SECRET nor SUPABASE_SERVICE_KEY is set (local
# in-memory mode): tokens then stop working when the process restarts.
_EPHEMERAL_SECRET = secrets.token_bytes(32)


# ── Passwords ───────────────────────────────────────────────────────────────

def hash_password(password: str, salt_hex: str | None = None, iterations: int = PBKDF2_ITERATIONS) -> str:
    salt_hex = salt_hex or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), iterations)
    return f"pbkdf2_sha256${iterations}${salt_hex}${dk.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        algo, iterations, salt_hex, digest = (stored or "").split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(dk.hex(), digest)
    except (ValueError, TypeError):
        return False


# ── Doctor bearer tokens ────────────────────────────────────────────────────

def _secret() -> bytes:
    base = os.getenv("AUTH_SECRET") or os.getenv("SUPABASE_SERVICE_KEY")
    if not base:
        return _EPHEMERAL_SECRET
    return hashlib.sha256(b"medibridge-doctor-auth:" + base.encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(doctor_id: str, name: str, ttl: int = TOKEN_TTL_SECONDS, now: float | None = None) -> str:
    payload = {"sub": doctor_id, "name": name, "exp": int((now or time.time()) + ttl)}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_token(token: str | None, now: float | None = None) -> dict | None:
    """Returns the payload ({sub, name, exp}) or None if missing, forged or expired."""
    try:
        body, sig = (token or "").split(".")
        expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_unb64(body))
        if payload.get("exp", 0) < (now or time.time()):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


# ── Patient identity ────────────────────────────────────────────────────────

def new_patient_code() -> str:
    return "PAT-" + secrets.token_hex(4).upper()  # e.g. PAT-8F42A91C


def new_patient_token() -> str:
    return secrets.token_urlsafe(32)


def hash_patient_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def patient_token_matches(token: str | None, stored_hash: str | None) -> bool:
    if not token or not stored_hash:
        return False
    return hmac.compare_digest(hash_patient_token(token), stored_hash)
