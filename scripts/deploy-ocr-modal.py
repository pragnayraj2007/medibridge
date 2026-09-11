"""Deploys the MediBridge PaddleOCR service to Modal (free credits, no card) and tests it.

Needs MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in apps/backend/local-secrets.txt.
Writes PADDLEOCR_URL and PADDLEOCR_TOKEN there for set-api-env.bat. Tokens are never printed.

    apps\\backend\\.venv\\Scripts\\python.exe -u scripts\\deploy-ocr-modal.py
"""
import base64
import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECRETS = ROOT / "apps" / "backend" / "local-secrets.txt"
SERVICE = ROOT / "apps" / "ocr-service"
SAMPLE = ROOT / "scripts" / "samples" / "sample-lab-report.png"


def read_secrets() -> dict:
    out = {}
    for line in SECRETS.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def add_secret(name: str, value: str) -> None:
    lines = [ln for ln in SECRETS.read_text(encoding="utf-8-sig").splitlines() if not ln.startswith(name + "=")]
    lines.append(f"{name}={value}")
    SECRETS.write_text("\n".join(lines) + "\n", encoding="utf-8")


def modal(args: list[str], env: dict, hide: str | None = None) -> str:
    r = subprocess.run([sys.executable, "-m", "modal", *args], cwd=SERVICE, env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = (r.stdout or "") + (r.stderr or "")
    print(out.replace(hide, "<hidden>") if hide else out, flush=True)
    if r.returncode:
        raise SystemExit(f"modal {args[0]} failed with exit code {r.returncode}")
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Modal prints emoji; Windows consoles are cp1252
    s = read_secrets()
    token_id, token_secret = s.get("MODAL_TOKEN_ID", ""), s.get("MODAL_TOKEN_SECRET", "")
    # Also accept the pasted "modal token set --token-id ak-... --token-secret as-..." command
    text = SECRETS.read_text(encoding="utf-8-sig")
    if m := re.search(r"--token-id[ =](\S+)", text):
        token_id = m.group(1)
    if m := re.search(r"--token-secret[ =](\S+)", text):
        token_secret = m.group(1)
    if not (token_id.startswith("ak-") and token_secret.startswith("as-")):
        print("Modal token not found: need MODAL_TOKEN_ID=ak-... and MODAL_TOKEN_SECRET=as-... in local-secrets.txt")
        return 1
    env = {**os.environ, "MODAL_TOKEN_ID": token_id, "MODAL_TOKEN_SECRET": token_secret,
           "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "NO_COLOR": "1", "TERM": "dumb"}
    ocr_token = s.get("PADDLEOCR_TOKEN") or secrets.token_urlsafe(24)

    print("== secret", flush=True)
    modal(["secret", "create", "medibridge-ocr", f"OCR_TOKEN={ocr_token}", "--force"], env, hide=ocr_token)
    print("== deploy (first build downloads PaddlePaddle + models: 5-10 minutes)", flush=True)
    out = modal(["deploy", "modal_app.py"], env)
    m = re.search(r"https://[A-Za-z0-9-]+--medibridge-ocr-web[A-Za-z0-9-]*\.modal\.run", out)
    if not m:
        print("Could not find the endpoint URL in the deploy output.")
        return 1
    url = m.group(0)
    add_secret("PADDLEOCR_URL", url)
    add_secret("PADDLEOCR_TOKEN", ocr_token)
    print(f"== endpoint {url}", flush=True)

    body = json.dumps({"file": base64.b64encode(SAMPLE.read_bytes()).decode(), "fileType": 1}).encode()
    for attempt in range(3):  # first call includes the cold start
        try:
            started = time.time()
            req = urllib.request.Request(f"{url}/ocr", data=body, method="POST",
                                         headers={"Content-Type": "application/json", "Authorization": f"Bearer {ocr_token}"})
            with urllib.request.urlopen(req, timeout=240) as r:
                res = json.loads(r.read())
            if res.get("errorCode"):
                print(f"  OCR error: {res}")
            else:
                lines = res["result"]["ocrResults"][0]["prunedResult"]["rec_texts"]
                print(f"OCR OK: {len(lines)} lines in {time.time() - started:.1f}s, e.g. {lines[:5]}")
                return 0
        except Exception as e:
            print(f"  test attempt {attempt + 1} failed: {type(e).__name__}: {str(e)[:200]}")
        time.sleep(10)
    return 1


if __name__ == "__main__":
    sys.exit(main())
