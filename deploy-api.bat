@echo off
REM Deploys the FastAPI backend (apps\backend) to the medibridge-api Vercel project.
cd /d "%~dp0apps\backend"
REM render.yaml is from the old Render plan; Vercel mistakes it for a service definition.
if exist render.yaml (
  if not exist "%~dp0_to_delete" mkdir "%~dp0_to_delete"
  move /y render.yaml "%~dp0_to_delete\render.yaml" >nul
)
call npx --yes vercel@latest deploy --prod --yes
set ERR=%ERRORLEVEL%
if not "%~1"=="nopause" pause
exit /b %ERR%
