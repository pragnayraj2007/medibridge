@echo off
REM End-to-end check of the deployed demo (phone path + doctor path). Report: _to_delete\smoke-test-report.txt
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
pause
