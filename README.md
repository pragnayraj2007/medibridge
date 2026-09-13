# MediBridge

AI-assisted clinical intake and triage platform. Reduces the gap between patients and clinicians by structuring symptom information and prioritising urgency — without replacing doctors.

---

**Live demo:** https://medibridge-xi.vercel.app — patient app at `/patient`, doctor dashboard at `/doctor`.

---

## Architecture

```
Patient App ──┐
              ├──→ Backend (Vercel) ──→ Supabase
Doctor Web ───┘         │
                        ├──→ Groq (clinical agent)
                        ├──→ Gemini (multimodal)
                        ├──→ PaddleOCR
                        ├──→ Sarvam STT/TTS
                        └──→ WHO Safety Engine (deterministic)
```

Triage flow: `Patient input → AI extraction → Safety Engine → RED/YELLOW/GREEN → Doctor`

The LLM never makes the final triage decision. The deterministic Safety Engine does.

---

## Stack

| Layer | Technology |
|---|---|
| Patient Frontend | React Native (Expo) → Expo Go + web on Vercel |
| Doctor Frontend | Next.js → Vercel |
| Backend/API | FastAPI → Vercel (Python) |
| Database | Supabase |
| Clinical Agent | Groq `openai/gpt-oss-120b` |
| Multimodal | Gemini |
| OCR | PaddleOCR |
| STT | Sarvam Saaras v4 |
| TTS | Sarvam Bulbul v3 |
| Triage | Deterministic WHO-based Safety Engine |

---

## Project Structure

```
medibridge/
├── apps/
│   ├── patient-app/        # Expo (React Native) — patient mobile app
│   ├── doctor-dashboard/   # Next.js — clinician web dashboard
│   └── backend/            # FastAPI — API, AI pipeline, Safety Engine
│       ├── main.py           # API routes
│       ├── safety_engine.py  # deterministic RED/YELLOW/GREEN (WHO IITT)
│       ├── keywords.py       # danger-sign keyword safety net
│       ├── ai.py             # Groq: intake questions, extraction, summary
│       ├── storage.py        # Supabase REST, in-memory fallback
│       ├── supabase/schema.sql
│       └── tests/
├── .env.example
├── .gitignore
└── README.md
```

---

## Setup
MediBridge is an active prototype focused on AI-assisted clinical intake and deterministic patient triage.

### Current Stack

- Frontend: Next.js / Expo
- Backend: FastAPI
- AI: Groq
- Database: Supabase
- Safety: Deterministic WHO/ICRC/MSF IITT-based Safety Engine

### Prerequisites

- Node.js 18+
- Python 3.11+

### Patient App

See `apps/patient-app/SETUP.txt`, then `npx expo start` and scan the QR code with Expo Go.

### Doctor Dashboard

```bash
cd apps/doctor-dashboard
npm install
npm run dev        # http://localhost:3001/doctor — proxies /api to BACKEND_URL (default http://127.0.0.1:8000)
```

### Backend

```bash
cd apps/backend
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt      # Windows: .venv\Scripts\python
cp .env.example .env                                      # all keys optional for local dev
.venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
.venv/bin/python -m unittest discover -s tests            # Safety Engine tests
```

Without `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` cases are kept in memory (lost on restart).
Without `GROQ_API_KEY` the intake uses scripted questions and keyword-only extraction.
For Supabase, run `supabase/schema.sql` once in the SQL editor. API docs: http://localhost:8000/docs

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, storage mode, AI mode |
| POST | `/intake/next-question` | next intake question + live safety check |
| POST | `/cases` | submit intake → extraction → Safety Engine → stored case + patient guidance |
| GET | `/cases?triage_level=&status=` | doctor case list (newest first) |
| GET | `/cases/{id}` | case detail |
| PATCH | `/cases/{id}` | set status: `new` / `reviewed` / `follow_up` |

### Safety Engine

`safety_engine.py` applies the WHO/ICRC/MSF [Interagency Integrated Triage Tool](https://www.who.int/tools/triage) (adult) criteria to flags, age, pregnancy and vitals. Flags come from the keyword matcher **and** Groq; Groq can add flags from a fixed vocabulary but never sets the level. Every result lists the rules that fired. Extra conservative rules are labelled `MediBridge`. Thresholds need clinical review before real use.

---

## Deployment (Vercel + Supabase)

Everything opens from one URL (the `doctor-dashboard` Vercel project):

| Path | What |
|---|---|
| `/` | Home — links to both apps |
| `/patient` | Patient app (Expo web export, built by `apps/patient-app/export-web.bat`) |
| `/doctor` | Doctor dashboard |
| `/api/*` | Backend, proxied to the FastAPI Vercel project (`BACKEND_URL`) |

First-time setup (Windows, double-click the scripts in the repo root):

1. **Supabase** — create a project, run `apps/backend/supabase/schema.sql` in the SQL Editor, copy the Project URL and a secret key.
2. `vercel-setup.bat` — logs in to Vercel and creates the projects `medibridge-api` (backend) and `medibridge` (site).
3. In Vercel → `medibridge-api` → Settings → Environment Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (and `GROQ_API_KEY`). Then `deploy-api.bat`.
4. In Vercel → `medibridge` → Environment Variables: `BACKEND_URL` = the backend's production URL. Then `deploy-site.bat` (builds the patient web app into `/patient` and deploys the site).

Later updates: `deploy.bat` (backend, then site).

The Vercel backend needs Supabase — serverless instances don't share memory.

## Environment Variables

See `.env.example` at the repo root and `apps/backend/.env.example`.

Never commit `.env` files.

---

## Git Branches

```
main
├── feature/patient-app
├── feature/doctor-dashboard
├── feature/backend
├── feature/ai
├── feature/safety-engine
└── feature/mvp-integration
```

---

## Demo Flow

1. Patient opens app → enters symptoms via text/voice
2. AI extracts structured clinical data
3. WHO Safety Engine classifies: RED / YELLOW / GREEN
4. Patient sees clear guidance
5. Doctor opens dashboard → sees prioritised case list
6. Doctor reviews AI summary + triage → makes clinical decision

--- //fff

## Team

MediBridge — Hackathon 2026

