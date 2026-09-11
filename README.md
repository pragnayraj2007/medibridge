# MediBridge

AI-assisted clinical intake and triage platform. Reduces the gap between patients and clinicians by structuring symptom information and prioritising urgency — without replacing doctors.

---

## Architecture

```
Patient App ──┐
              ├──→ Backend (Render) ──→ Supabase
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
| Patient Frontend | Next.js → Vercel |
| Doctor Frontend | Next.js → Vercel |
| Backend/API | FastAPI → Render |
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
│   ├── patient-app/        # Next.js — patient-facing mobile app
│   ├── doctor-dashboard/   # Next.js — clinician web dashboard
│   └── backend/            # FastAPI — API, AI pipeline, Safety Engine
├── .env.example
├── .gitignore
└── README.md
```

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.11+

### Patient App

```bash
cd apps/patient-app
npm install
cp ../../.env.example .env.local   # fill in NEXT_PUBLIC_API_URL
npm run dev                        # http://localhost:3000
```

### Doctor Dashboard

```bash
cd apps/doctor-dashboard
npm install
cp ../../.env.example .env.local   # fill in NEXT_PUBLIC_API_URL
npm run dev                        # http://localhost:3001
```

### Backend

```bash
cd apps/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # fill in all keys
uvicorn main:app --reload --port 8000
```

---

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

---

## Team

MediBridge — Hackathon 2026
