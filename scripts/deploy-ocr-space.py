"""Creates / updates the MediBridge PaddleOCR service on Hugging Face Spaces and waits until it runs.

Needs HF_TOKEN (a Hugging Face "Write" access token) in apps/backend/local-secrets.txt.
Adds PADDLEOCR_URL and PADDLEOCR_TOKEN to that file (the backend reads them via set-api-env.bat).
Tokens are never printed.

    apps\\backend\\.venv\\Scripts\\python.exe scripts\\deploy-ocr-space.py
"""
import base64
import json
import secrets
import sys
import time
import urllib.request
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parent.parent
SECRETS = ROOT / "apps" / "backend" / "local-secrets.txt"
SERVICE = ROOT / "apps" / "ocr-service"
SAMPLE = ROOT / "scripts" / "samples" / "sample-lab-report.png"
SPACE = "medibridge-ocr"


def read_secrets() -> dict:
    out = {}
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def add_secret(name: str, value: str) -> None:
    text = SECRETS.read_text(encoding="utf-8")
    lines = [l for l in text.splitlines() if not l.startswith(name + "=")]
    lines.append(f"{name}={value}")
    SECRETS.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    s = read_secrets()
    if not s.get("HF_TOKEN"):
        print("HF_TOKEN missing from apps/backend/local-secrets.txt")
        return 1
    api = HfApi(token=s["HF_TOKEN"])
    user = api.whoami()["name"]
    repo_id = f"{user}/{SPACE}"
    url = f"https://{user.lower().replace('_', '-').replace('.', '-')}-{SPACE}.hf.space"
    print(f"Space: {repo_id}  ->  {url}")

    ocr_token = s.get("PADDLEOCR_TOKEN") or secrets.token_urlsafe(24)
    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True, private=False)
    api.add_space_secret(repo_id, "OCR_TOKEN", ocr_token)
    api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=str(SERVICE),
                      commit_message="MediBridge OCR service")
    add_secret("PADDLEOCR_URL", url)
    add_secret("PADDLEOCR_TOKEN", ocr_token)
    print("Uploaded. Waiting for the Space to build (first build takes 5-15 minutes)...")

    last = None
    for _ in range(90):  # up to 30 minutes
        stage = api.get_space_runtime(repo_id).stage
        if stage != last:
            print(f"  {time.strftime('%H:%M:%S')}  {stage}", flush=True)
            last = stage
        if stage == "RUNNING":
            break
        if stage in ("BUILD_ERROR", "RUNTIME_ERROR", "CONFIG_ERROR", "NO_APP_FILE"):
            print(f"Space failed: {stage}. Open https://huggingface.co/spaces/{repo_id} -> Logs")
            return 1
        time.sleep(20)
    else:
        print("Timed out waiting for the Space.")
        return 1

    body = json.dumps({"file": base64.b64encode(SAMPLE.read_bytes()).decode(), "fileType": 1}).encode()
    req = urllib.request.Request(f"{url}/ocr", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {ocr_token}"})
    for attempt in range(6):  # the first call may wait for the container to wake
        try:
            started = time.time()
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.loads(r.read())
            lines = res["result"]["ocrResults"][0]["prunedResult"]["rec_texts"]
            print(f"OCR OK: {len(lines)} lines in {time.time() - started:.1f}s, e.g. {lines[:4]}")
            return 0
        except Exception as e:
            print(f"  test attempt {attempt + 1} failed: {type(e).__name__}: {str(e)[:150]}")
            time.sleep(20)
    return 1


if __name__ == "__main__":
    sys.exit(main())
