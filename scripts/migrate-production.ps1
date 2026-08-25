<#
  Apply the migration chain to production.

      .\scripts\migrate-production.ps1            # show what is pending (read-only)
      .\scripts\migrate-production.ps1 -Apply     # apply it

  WHY THIS EXISTS
  ───────────────
  The migration needs five variables from `backend/.env` plus three that must
  be stated deliberately, and getting one wrong points the run at the wrong
  database. Typing eight environment variables by hand at the moment you are
  migrating production is the wrong time to make a typo.

  It reads `backend/.env` and never writes to it.

  BEFORE YOU RUN IT WITH -Apply
  ─────────────────────────────
  Take a backup and confirm it restores:

      node scripts/dump-database.mjs C:\somewhere\outside\the\repo\backup.sql

  `docs/DEPLOYING.md` §2b explains what the chain does to a database built by
  the other migrator, and §4 how to roll each part back.
#>
param([switch]$Apply)

$ErrorActionPreference = "Stop"
$Root    = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root "backend\.env"
if (-not (Test-Path $EnvFile)) { throw "backend\.env not found at $EnvFile" }

# Load backend/.env into this process only. KEY=VALUE, quotes stripped,
# blanks and comments skipped. Nothing is written back.
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $key = $line.Substring(0, $i).Trim()
  $val = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
  Set-Item -Path "Env:$key" -Value $val
}

# Stated deliberately rather than inherited: the guard in
# config/environment.js exists to catch a development process pointed at
# production data, and it can only do that if the process says what it is.
$env:APP_ENV      = "production"
$env:DATABASE_ENV = "production"

Write-Host ""
Write-Host "  target : $($env:DB_HOST):$($env:DB_PORT)/$($env:DB_NAME)"
Write-Host ""

Push-Location (Join-Path $Root "backend")
try {
  if ($Apply) {
    # migrate.js refuses to write to a production database without this, and
    # it must name the exact database — a generic value unlocks nothing.
    $env:IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION = $env:DB_NAME
    Write-Host "  APPLYING. Ctrl+C now if the target above is not what you meant." -ForegroundColor Yellow
    Write-Host ""
    node scripts/migrate.js
  } else {
    # --status opens no transaction and creates nothing, including the
    # ledger table it would otherwise create (Phase 2.75 fixed that).
    node scripts/migrate.js --status
    Write-Host ""
    Write-Host "  Read-only. Re-run with -Apply to migrate." -ForegroundColor Cyan
    Write-Host ""
  }
} finally {
  Pop-Location
  Remove-Item Env:IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION -ErrorAction SilentlyContinue
}
