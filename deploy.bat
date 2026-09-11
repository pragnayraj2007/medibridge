@echo off
REM Redeploys everything: backend first, then the site.
cd /d "%~dp0"
call deploy-api.bat nopause || goto :fail
call deploy-site.bat nopause || goto :fail
echo.
echo ALL DEPLOYED.
pause
goto :eof
:fail
echo DEPLOY FAILED - see the error above.
pause
exit /b 1
