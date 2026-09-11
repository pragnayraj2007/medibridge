@echo off
REM Builds the patient web app into the doctor-dashboard site at /patient.
REM The API is same-origin there, so it calls /api.
setlocal
cd /d "%~dp0"
set EXPO_PUBLIC_API_URL=/api
set EXPO_BASE_URL=/patient
call npx expo export --platform web --output-dir ..\doctor-dashboard\public\patient || (endlocal & exit /b 1)
endlocal
exit /b 0
