@echo off
REM Copies the keys in apps\backend\local-secrets.txt (never uploaded or committed) into the
REM medibridge-api Vercel project, then redeploys the backend. Optional keys are skipped
REM when missing (the backend then uses its fallbacks: no voice, no document analysis...).
setlocal
cd /d "%~dp0apps\backend"
if not exist local-secrets.txt (echo apps\backend\local-secrets.txt not found. & goto :fail)
call :addkey SUPABASE_URL --no-sensitive required || goto :fail
call :addkey SUPABASE_SERVICE_KEY --sensitive required || goto :fail
call :addkey GROQ_API_KEY --sensitive || goto :fail
call :addkey GEMINI_API_KEY --sensitive || goto :fail
call :addkey SARVAM_API_KEY --sensitive || goto :fail
call :addkey PADDLEOCR_URL --no-sensitive || goto :fail
call :addkey PADDLEOCR_TOKEN --sensitive || goto :fail
echo Deploying backend...
call npx --yes vercel@latest deploy --prod --yes
if errorlevel 1 goto :fail
echo.
echo BACKEND DEPLOYED.
if not "%~1"=="nopause" pause
exit /b 0

:addkey
REM %1 = name, %2 = --sensitive / --no-sensitive, %3 = "required" to fail when missing
findstr /b /c:"%1=" local-secrets.txt >nul
if errorlevel 1 (
  if "%3"=="required" (echo %1 missing from local-secrets.txt & exit /b 1)
  echo [skip] %1 not in local-secrets.txt
  exit /b 0
)
set "PS_GET=$l=Get-Content local-secrets.txt | Where-Object { $_ -like '%1=*' } | Select-Object -First 1; $v=($l -split '=',2)[1].Trim()"
powershell -NoProfile -Command "%PS_GET%; if(-not $v){exit 3}"
if errorlevel 3 (echo [skip] %1 is empty & exit /b 0)
echo [set] %1
powershell -NoProfile -Command "%PS_GET%; [Console]::Out.Write($v)" | npx --yes vercel@latest env add %1 production --force %2
set ERR=%ERRORLEVEL%
exit /b %ERR%

:fail
echo FAILED - see the error above.
if not "%~1"=="nopause" pause
exit /b 1
