@echo off
REM Starts MediBridge: backend, doctor dashboard and patient app, each in its own window.
cd /d "%~dp0"
start "MediBridge backend" cmd /k "cd apps\backend && .venv\Scripts\python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
start "MediBridge dashboard" cmd /k "cd apps\doctor-dashboard && npm run dev"
start "MediBridge patient app" cmd /k "cd apps\patient-mobile && npx expo start"
