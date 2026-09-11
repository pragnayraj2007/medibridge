"""QR code for the patient ID. It encodes the patient code only (e.g. PAT-8F42A91C),
never names or medical information. Returns None if segno is unavailable, in
which case the app shows the code as text."""
from __future__ import annotations

import logging

log = logging.getLogger("medibridge.qr")


def qr_data_uri(patient_code: str) -> str | None:
    try:
        import segno
        return segno.make(patient_code, error="m").png_data_uri(scale=8, border=2, dark="#0D2B6B")
    except Exception as e:  # ImportError or encoder error
        log.warning("QR generation failed: %s", e)
        return None
