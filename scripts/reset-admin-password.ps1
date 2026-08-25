<#
  Set a new password for the production administrator.

      .\scripts\reset-admin-password.ps1

  WHY THIS IS A SCRIPT AND NOT A DASHBOARD BUTTON
  ──────────────────────────────────────────────
  There is no password reset in the product for an account nobody can sign
  into. `backend/scripts/resetAdmin.js` is the supported path — it exists
  because the repository once shipped every administrator with the password
  `admin123`, printed in a comment. Any database that credential ever touched
  must be treated as compromised, which is why this script will not accept it
  or any other value from that list.

  WHAT IT DOES
  ────────────
  Finds the administrator by email or phone and rotates that row's password.
  It does not create a second administrator: production already has exactly
  one, `admin@imap.bd` / 01700000000, and both are passed so the existing row
  is the one found.

  The new password is GENERATED — 24 characters, ~142 bits — and printed
  once. It is not written to a file, a log, or this script. If you lose it,
  run this again; there is no way to read it back.

  Nothing else about the account changes: the id, the referral code, and any
  history stay as they are. `role`, `is_active` and `verified` are asserted
  rather than modified, so an account that was already an active administrator
  is unchanged in every respect except the password.

  ⚠ Anyone signed in as this administrator elsewhere keeps their session until
  it expires. The password is what changes, not the outstanding tokens.
#>
$ErrorActionPreference = "Stop"
$Root    = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root "backend\.env"
if (-not (Test-Path $EnvFile)) { throw "backend\.env not found at $EnvFile" }

# Load backend/.env into this process only. Never written back.
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  Set-Item -Path "Env:$($line.Substring(0, $i).Trim())" `
           -Value $line.Substring($i + 1).Trim().Trim('"').Trim("'")
}

$env:APP_ENV      = "production"
$env:DATABASE_ENV = "production"

Write-Host ""
Write-Host "  target : $($env:DB_HOST):$($env:DB_PORT)/$($env:DB_NAME)"
Write-Host ""

# The administrator that exists. Both identifiers are passed so the lookup
# matches the existing row rather than inserting a second one, and the name is
# passed because the script writes it — omitting it would rename the account
# to "IMAP Administrator".
$env:ADMIN_BOOTSTRAP_EMAIL = "admin@imap.bd"
$env:ADMIN_BOOTSTRAP_PHONE = "01700000000"
$env:ADMIN_BOOTSTRAP_NAME  = "Admin User"
# Deliberately NOT set: resetAdmin.js generates a strong one and prints it
# once. A password chosen at a prompt is the weaker of the two options.
Remove-Item Env:ADMIN_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue

Push-Location (Join-Path $Root "backend")
try {
  $env:IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION = $env:DB_NAME
  node scripts/resetAdmin.js
} finally {
  Pop-Location
  Remove-Item Env:IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_BOOTSTRAP_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_BOOTSTRAP_PHONE -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_BOOTSTRAP_NAME  -ErrorAction SilentlyContinue
}
