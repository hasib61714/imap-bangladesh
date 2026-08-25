@echo off
REM ===================================================================
REM  Set a new password for the production administrator.
REM
REM  Use this when nobody knows the admin password. It rotates the
REM  existing account (admin@imap.bd / 01700000000) — it does not create
REM  a second one.
REM
REM  The new password is generated, 24 characters, and shown ONCE.
REM  Have somewhere to paste it before you continue.
REM ===================================================================
setlocal
cd /d "%~dp0"

echo.
echo   ==========================================================
echo     IMAP  -  RESET THE ADMINISTRATOR PASSWORD
echo   ==========================================================
echo.
echo   This changes the password for admin@imap.bd on the LIVE
echo   database. A new one is generated and shown once - it is not
echo   saved anywhere, so copy it immediately.
echo.
echo   Nothing else about the account changes.
echo.

set "CONFIRM="
set /p CONFIRM="  Type  YES  and press Enter to continue (anything else cancels): "

if /I not "%CONFIRM%"=="YES" (
  echo.
  echo   Cancelled. The password was not changed.
  echo.
  pause
  exit /b 0
)

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\reset-admin-password.ps1"

if errorlevel 1 (
  echo.
  echo   It failed. Nothing was changed. Send the output above to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo   ==========================================================
echo     COPY THE PASSWORD ABOVE NOW.
echo     It is not stored and cannot be shown again.
echo   ==========================================================
echo.
pause
