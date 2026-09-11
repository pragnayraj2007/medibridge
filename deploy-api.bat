@echo off
REM Deploys the FastAPI backend (apps\backend) to the medibridge-api Vercel project.
cd /d "%~dp0apps\backend"
call npx --yes vercel@latest deploy --prod --yes
set ERR=%ERRORLEVEL%
if not "%~1"=="nopause" pause
exit /b %ERR%
