# MediBridge

AI-assisted clinical intake, triage and appointment booking for a hackathon. Patients describe how they feel by voice or text and add their reports. A deterministic Safety Engine sets the urgency, a deterministic scheduler books the earliest suitable nearby doctor, and the doctor sees one fused, AI-summarised case. The doctor makes every clinical decision.

## Demo

| Client | Where |
|---|---|
| Patient (primary) | Expo app on Android (Expo Go or an APK from `eas build`) |
| Patient (fallback) | https://medibridge-xi.vercel.app/patient |
| Doctor | https://medibridge-xi.vercel.app/doctor (sign in with a demo doctor account) |
| Backend API | https://medibridge-api-rose.vercel.app (`/health`, `/docs`) |

`smoke-test.bat` checks the whole path (patient API → Supabase → scheduling → doctor site). Set `MEDIBRIDGE_DEMO_PASSWORD` first.

Demo script: open `/patient` and create a patient ID. Home shows the ID and QR code, appointments and previous cases. Start a consultation, pick a language, answer by voice or text, and upload a report. Chest pain at 62 comes back RED with an urgent appointment. Dr. Arjun Mehta (1.2 km) is busy, so the case goes to Dr. Ananya Rao (2.1 km), who has the earliest slot. On `/doctor`, sign in and open the case. Switch Dr. Mehta to Available, submit another case, and it goes to him. "Reset demo scenario" restores the starting state.

## Architecture

```
Patient app (Expo) ──┐                        ┌── Groq gpt-oss-120b: questions, extraction, summary
                     ├──→ FastAPI (Vercel) ───┼── Safety Engine (deterministic, final triage)
Doctor web (Next.js)─┘     via /api proxy     ├── Scheduler (deterministic: priority, availability, distance)
                                              ├── Sarvam: speech-to-text (Saaras) / text-to-speech (Bulbul)
                                              ├── PaddleOCR (Modal, scales to zero) + Gemini multimodal
                                              └── Supabase: patients, doctors, cases, appointments, documents
```

`submit → extraction → data fusion → Safety Engine → case → priority → available doctors → earliest valid slot → appointment`

- **Persistent patient ID** (`PAT-XXXXXXXX`), created once and stored in Supabase. The QR code encodes only this ID. The device keeps a random token, stored hashed on the server, and history is readable only with that token or by a signed-in doctor.
- **Intake chat**: one open question at a time from Groq, in the chosen language (en, hi, te, ta, kn, mr). The length is fixed in code: 6 questions for a basic problem, 4 once the Safety Engine flags a danger sign (RED). Each question has a fixed topic (main problem, onset, severity, other symptoms, conditions, medicines and allergies), so the model only phrases it. No quick-reply chips. Answers are typed or spoken. Questions can be read aloud.
- **Voice**: audio goes to the backend and on to Sarvam. Phones send recordings and documents as base64 JSON (`/voice/transcribe-json`, `/documents/json`) because multipart uploads are unreliable in Expo Go on Android; the web uses multipart. Models are set with `SARVAM_STT_MODEL` / `SARVAM_TTS_MODEL`. Any failure (permission, recording, network, API) shows a note and typing continues.
- **Documents**: PDF, JPG, PNG and WEBP up to 4 MB (3 MB from the phone app, since base64 adds a third and Vercel caps requests at 4.5 MB). The pipeline is upload → PaddleOCR (if `PADDLEOCR_URL` is set) → Gemini structured findings. Each stage reports done, empty, not available or failed, so a failed document never blocks the intake. Originals are kept in a private Supabase bucket.
- **Data fusion** (`fusion.py`): combines profile, conversation, voice transcripts, extraction, documents (OCR + Gemini), previous cases and vitals. Contradictions (age, timeline versus a previous case) and unconfirmed items (medicines or allergies found only in a document) are kept as `conflicts`. The Groq summary must state both sides.
- **Safety Engine** (`safety_engine.py`, WHO/ICRC/MSF IITT adult criteria): keyword flags ∪ AI flags ∪ document flags → RED/YELLOW/GREEN. Other sources can add flags; nothing removes a keyword flag. The AI summary never sets urgency.
- **Scheduling** (`scheduling.py`, deterministic):
  - Priority is RED 1, YELLOW 2, GREEN 3, and only doctors marked `available` are considered.
  - RED gets the earliest slot. Within 5 minutes the closer doctor wins.
  - YELLOW minimises wait + 2 min/km, starting 10 minutes out.
  - GREEN minimises wait + 10 min/km, starting 2 hours out, so routine bookings never take near-term slots. GREEN patients can pick a later time.
  - Double booking is blocked by a unique index, and a clash triggers a retry.
  - Every decision stores each doctor considered and a readable reason.
- **Doctor side**:
  - Demo login (PBKDF2 hashes, signed 12-hour tokens).
  - Cases and appointments sorted by triage, then appointment time, then creation time.
  - Doctor availability controls.
  - Case page with final triage and the rules that fired, the engine inputs, a separate AI summary, conflicts, document findings, previous cases, the conversation and appointment status buttons (scheduled → confirmed → in_progress → completed, or cancelled).

## Stack

Expo SDK 57 (React Native) · Next.js 14 · FastAPI on Vercel · Supabase · Groq `openai/gpt-oss-120b` · Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash`, with fallbacks) · PaddleOCR 3.x on Modal · Sarvam Saaras v4 / Bulbul v3

## Run locally

```bash
# Backend (all keys optional; without Supabase it uses memory + seeded demo doctors)
cd apps/backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000
.venv/bin/python -m unittest discover -s tests      # Safety Engine, scheduling, fusion, auth, voice, documents

# Doctor dashboard: http://localhost:3001/doctor (proxies /api to BACKEND_URL)
cd apps/doctor-dashboard && npm install && npm run dev

# Patient app (uses the deployed backend unless EXPO_PUBLIC_API_URL is set)
cd apps/patient-app && npm install && npx expo start -c
npx eas-cli@latest build -p android --profile preview   # installable APK
```

Database: in the Supabase SQL Editor run `apps/backend/supabase/schema.sql`, then `supabase/migrations/002_patients_appointments.sql`. The migration adds the tables, the private `documents` bucket and the three demo doctors. The demo doctor password is shared by the team and is not in this repo (only its hash is).

PaddleOCR is too large for Vercel functions, so it runs as its own small service: `apps/ocr-service` (PaddleOCR 3.x, PP-OCRv5 mobile models) on Modal. Modal's free monthly credits need no card, and the service scales to zero when idle. Put `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET` in `local-secrets.txt` and run `scripts/deploy-ocr-modal.py`. It creates the bearer-token secret, deploys, tests with the sample report and writes `PADDLEOCR_URL`/`PADDLEOCR_TOKEN` for `set-api-env.bat`. Starting a consultation wakes the service early. If OCR is slow or down, Gemini still reads the document.

## Deploy (Windows, from the repo root)

- `set-api-env.bat` copies keys from `apps/backend/local-secrets.txt` (git-ignored) to the Vercel backend and deploys it.
- `deploy-site.bat` builds the patient web app into `/patient` and deploys the site.

| Where | Variables |
|---|---|
| Vercel `medibridge-api` | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `SARVAM_API_KEY`, optional `PADDLEOCR_URL`, `AUTH_SECRET`, `SARVAM_*`, `GEMINI_MODEL`, `SCHED_LEAD_*_MIN`, `DEMO_PATIENT_LAT/LNG` |
| Vercel `medibridge` | `BACKEND_URL` |
| Patient app | `EXPO_PUBLIC_API_URL` (optional override) |

Secrets exist only on the backend. Never commit `.env` or `local-secrets.txt`.

## Demo limitations

- Distances use one fixed demo patient location. Patient GPS is not used yet.
- There are no working-hours calendars, and urgent cases do not bump existing bookings.
- Doctor auth is demo-grade. A patient ID can only be reopened on the device that created it.
- PaddleOCR on Modal takes about 20 s to wake after idling; the app wakes it when a consultation starts, and Gemini covers any gap.
- Voice and document analysis need `SARVAM_API_KEY` and `GEMINI_API_KEY`. Without them the app says so and continues with text.
- The Safety Engine thresholds and the scheduling rules need clinical review before any real use. This is a workflow tool, not a diagnostic system.
