@echo off
REM Redeploys MediBridge to Vercel (run after the first-time setup in README).
REM   1) builds the patient web app into the dashboard site (/patient)
REM   2) deploys the backend API project
REM   3) deploys the site (home, /doctor, /patient, /api proxy)
cd /d "%~dp0"
set PAPP=apps\patient-app
if exist apps\patient-mobile\app.json set PAPP=apps\patient-mobile
call %PAPP%\export-web.bat || goto :fail
pushd apps\backend
call npx vercel deploy --prod --yes || (popd & goto :fail)
popd
pushd apps\doctor-dashboard
call npx vercel deploy --prod --yes || (popd & goto :fail)
popd
echo.
echo Done. Open your site URL shown above.
goto :eof
:fail
echo Deploy failed - see the error above.
exit /b 1
