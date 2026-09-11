@echo off
REM Checks the patient app is ready for Android: dependency versions, resolved
REM config (API URL, package name) and that the Android JS bundle builds.
REM Report: ..\..\_to_delete\android-check.txt
setlocal
cd /d "%~dp0"
set OUT=%~dp0..\..\_to_delete\android-check.txt
if not exist "%~dp0..\..\_to_delete" mkdir "%~dp0..\..\_to_delete"
(
  echo === expo install --check
  call npx expo install --check
  echo === resolved config
  call npx expo config --type public --json
  echo === android bundle export
  call npx expo export --platform android --output-dir "%TEMP%\mb-android-check"
  echo === exit %ERRORLEVEL%
) > "%OUT%" 2>&1
echo Report written to %OUT%
endlocal
timeout /t 3 >nul
