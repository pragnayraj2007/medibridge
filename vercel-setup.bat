@echo off
REM One-time: log in to Vercel and create the two projects (medibridge-api, medibridge).
cd /d "%~dp0"
REM The old doctor route at src\app\patient clashes with the patient web app at /patient.
if exist apps\doctor-dashboard\src\app\patient (
  if not exist _to_delete mkdir _to_delete
  move apps\doctor-dashboard\src\app\patient _to_delete\old-doctor-patient-route >nul
  echo Moved old route to _to_delete\ ^(safe to delete^).
)
echo.
echo [1/3] Log in to Vercel - finish the login in the browser window that opens.
call npx --yes vercel@latest login || goto :fail
echo.
echo [2/3] Creating project medibridge-api (backend)...
pushd apps\backend
call npx --yes vercel@latest link --yes --project medibridge-api || (popd & goto :fail)
popd
echo.
echo [3/3] Creating project medibridge (website)...
pushd apps\doctor-dashboard
call npx --yes vercel@latest link --yes --project medibridge || (popd & goto :fail)
popd
echo.
echo SETUP DONE. Next: add environment variables in the Vercel dashboard.
pause
goto :eof
:fail
echo SETUP FAILED - see the error above.
pause
exit /b 1
