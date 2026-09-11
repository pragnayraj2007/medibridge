@echo off
REM Builds the patient web app into the site at /patient, then deploys the site
REM (home, /doctor, /patient, /api proxy) to the medibridge Vercel project.
cd /d "%~dp0"
set PAPP=apps\patient-app
if exist apps\patient-mobile\app.json set PAPP=apps\patient-mobile
call %PAPP%\export-web.bat
if errorlevel 1 goto :fail
cd /d "%~dp0apps\doctor-dashboard"
call npx --yes vercel@latest deploy --prod --yes
if errorlevel 1 goto :fail
if not "%~1"=="nopause" pause
goto :eof
:fail
echo DEPLOY FAILED - see the error above.
if not "%~1"=="nopause" pause
exit /b 1
