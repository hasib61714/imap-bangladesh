@echo off
REM ===================================================================
REM  Apply the migration chain to the production database.
REM
REM  Double-click this file. It shows you which database it is about to
REM  change and waits for you to type YES before touching anything.
REM
REM  What it runs is scripts\migrate-production.ps1 -Apply, which is the
REM  same command documented in docs\DEPLOYING.md. Nothing happens here
REM  that is not written down there.
REM ===================================================================
setlocal
cd /d "%~dp0"

echo.
echo   ==========================================================
echo     IMAP  -  PRODUCTION DATABASE MIGRATION
echo   ==========================================================
echo.
echo   First, what is pending. This step changes nothing.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\migrate-production.ps1"

if errorlevel 1 (
  echo.
  echo   The read-only check failed. Nothing was changed.
  echo   Send the message above to Claude before going further.
  echo.
  pause
  exit /b 1
)

echo.
echo   ----------------------------------------------------------
echo   If the list above is what you expected, this will apply it.
echo.
echo   A verified backup exists and a full rehearsal was run on a
echo   copy of this exact data. Rollback is in docs\DEPLOYING.md.
echo   ----------------------------------------------------------
echo.

set "CONFIRM="
set /p CONFIRM="  Type  YES  and press Enter to migrate (anything else cancels): "

if /I not "%CONFIRM%"=="YES" (
  echo.
  echo   Cancelled. Nothing was changed.
  echo.
  pause
  exit /b 0
)

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\migrate-production.ps1" -Apply

if errorlevel 1 (
  echo.
  echo   ==========================================================
  echo     THE MIGRATION REPORTED AN ERROR
  echo   ==========================================================
  echo.
  echo   The runner tolerates "already exists" and stops on anything
  echo   else, so it stops rather than continuing past a problem.
  echo   Copy everything above and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo   ==========================================================
echo     DONE. Tell Claude, and it will verify and deploy.
echo   ==========================================================
echo.
pause
