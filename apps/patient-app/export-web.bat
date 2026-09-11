@echo off
REM Builds the patient web app into the doctor-dashboard site at /patient.
REM The API is same-origin there, so it calls /api.
setlocal
cd /d "%~dp0"
set EXPO_PUBLIC_API_URL=/api
set EXPO_BASE_URL=/patient
call npx expo export --platform web --output-dir ..\doctor-dashboard\public\patient || (endlocal & exit /b 1)
REM Vercel never uploads folders named node_modules, so move package assets (icon fonts) to assets\nm.
powershell -NoProfile -Command "$d='..\doctor-dashboard\public\patient'; $a=Join-Path $d 'assets\node_modules'; if(Test-Path $a){ Rename-Item $a 'nm'; Get-ChildItem $d -Recurse -Include *.js,*.html,*.json | ForEach-Object { $t=[IO.File]::ReadAllText($_.FullName); $n=$t.Replace('/assets/node_modules/','/assets/nm/'); if($n -ne $t){ [IO.File]::WriteAllText($_.FullName,$n) } } }" || (endlocal & exit /b 1)
endlocal
exit /b 0
