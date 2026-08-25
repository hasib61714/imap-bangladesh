@echo off
REM Verify a deployment came up configured. Read-only; creates nothing.
REM Public checks run without credentials. The configuration report is
REM admin-only, so it asks you to sign in; press Enter to skip it.
setlocal
cd /d "%~dp0"
node scripts\check-deployment.mjs %*
echo.
pause
