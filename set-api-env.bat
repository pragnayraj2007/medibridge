@echo off
REM Copies the keys in apps\backend\local-secrets.txt (never uploaded or committed) into the
REM medibridge-api Vercel project, then redeploys the backend.
cd /d "%~dp0apps\backend"
if not exist local-secrets.txt (echo apps\backend\local-secrets.txt not found. & goto :fail)
echo [1/4] SUPABASE_URL
powershell -NoProfile -Command "$l=Get-Content local-secrets.txt | Where-Object { $_ -like 'SUPABASE_URL=*' } | Select-Object -First 1; if(-not $l){exit 1}; [Console]::Out.Write(($l -split '=',2)[1].Trim())" | npx --yes vercel@latest env add SUPABASE_URL production --force --no-sensitive
if errorlevel 1 goto :fail
echo [2/4] SUPABASE_SERVICE_KEY
powershell -NoProfile -Command "$l=Get-Content local-secrets.txt | Where-Object { $_ -like 'SUPABASE_SERVICE_KEY=*' } | Select-Object -First 1; if(-not $l){exit 1}; [Console]::Out.Write(($l -split '=',2)[1].Trim())" | npx --yes vercel@latest env add SUPABASE_SERVICE_KEY production --force --sensitive
if errorlevel 1 goto :fail
findstr /b "GROQ_API_KEY=" local-secrets.txt >nul
if errorlevel 1 goto :nogroq
echo [3/4] GROQ_API_KEY
powershell -NoProfile -Command "$l=Get-Content local-secrets.txt | Where-Object { $_ -like 'GROQ_API_KEY=*' } | Select-Object -First 1; if(-not $l){exit 1}; [Console]::Out.Write(($l -split '=',2)[1].Trim())" | npx --yes vercel@latest env add GROQ_API_KEY production --force --sensitive
if errorlevel 1 goto :fail
goto :deploy
:nogroq
echo [3/4] No GROQ_API_KEY - AI stays in rule-based mode.
:deploy
echo [4/4] Deploying backend...
call npx --yes vercel@latest deploy --prod --yes
if errorlevel 1 goto :fail
echo.
echo BACKEND DEPLOYED.
pause
goto :eof
:fail
echo FAILED - see the error above.
pause
exit /b 1
