@echo off
REM Type-checks the doctor dashboard and the patient app (catches errors before deploying).
REM Report: _to_delete\typecheck.txt
setlocal
cd /d "%~dp0"
if not exist _to_delete mkdir _to_delete
set OUT=%~dp0_to_delete\typecheck.txt
set PAPP=apps\patient-app
if exist apps\patient-mobile\app.json set PAPP=apps\patient-mobile
(
  echo === doctor-dashboard
  pushd apps\doctor-dashboard
  call npx tsc --noEmit -p .
  echo exit %ERRORLEVEL%
  popd
  echo === patient app
  pushd %PAPP%
  call npx tsc --noEmit -p .
  echo exit %ERRORLEVEL%
  popd
) > "%OUT%" 2>&1
type "%OUT%"
endlocal
timeout /t 5 >nul
