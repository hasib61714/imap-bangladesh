<#
  Local development database for IMAP.

  A MariaDB instance with its OWN datadir, port and credentials, entirely
  separate from any machine-wide service and from production. Nothing here
  can reach the TiDB cluster: config/environment.js refuses a
  non-production process against a production host, and this listens on
  loopback only.

    .\scripts\dev-db.ps1 up      initialise (if needed) and start
    .\scripts\dev-db.ps1 down    stop, leaving the data in place
    .\scripts\dev-db.ps1 reset   stop and destroy the datadir
    .\scripts\dev-db.ps1 status
#>
param([Parameter(Position = 0)][ValidateSet("up", "down", "reset", "status")][string]$Action = "up")

$ErrorActionPreference = "Stop"

$Bin = (Get-ChildItem "C:\Program Files\MariaDB*\bin\mariadbd.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1).DirectoryName
if (-not $Bin) { throw "MariaDB not found under C:\Program Files\MariaDB*" }

$Root = "$env:LOCALAPPDATA\imap-dev-db"
$Data = "$Root\data"
$Port = 3399
$Pass = "imap-dev-only"

function Alive {
  & "$Bin\mariadb-admin.exe" --protocol=TCP --host=127.0.0.1 --port=$Port `
    --user=root --password="$Pass" ping 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

switch ($Action) {
  "status" {
    Write-Output "datadir : $Data  (exists: $(Test-Path $Data))"
    Write-Output "port    : $Port  (alive: $(Alive))"
  }

  "up" {
    if (Alive) { Write-Output "already running on 127.0.0.1:$Port"; break }

    if (-not (Test-Path $Data)) {
      Write-Output "initialising datadir at $Data"
      New-Item -ItemType Directory -Force -Path $Root | Out-Null
      & "$Bin\mariadb-install-db.exe" --datadir="$Data" --password="$Pass" --port=$Port --service="" |
        Select-Object -Last 2
    }

    $p = Start-Process -FilePath "$Bin\mariadbd.exe" -PassThru -WindowStyle Hidden `
      -ArgumentList @("--datadir=$Data", "--port=$Port", "--socket=imapdev",
                      "--bind-address=127.0.0.1", "--skip-name-resolve", "--console") `
      -RedirectStandardOutput "$Root\out.log" -RedirectStandardError "$Root\err.log"
    $p.Id | Out-File -Encoding ascii "$Root\pid.txt"

    for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; if (Alive) { break } }
    if (-not (Alive)) { Get-Content "$Root\err.log" -Tail 20; throw "did not come up" }

    & "$Bin\mariadb.exe" --protocol=TCP --host=127.0.0.1 --port=$Port --user=root --password="$Pass" `
      -e "CREATE DATABASE IF NOT EXISTS imap_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    Write-Output "up on 127.0.0.1:$Port  database imap_dev"
  }

  "down" {
    if (Alive) {
      & "$Bin\mariadb-admin.exe" --protocol=TCP --host=127.0.0.1 --port=$Port `
        --user=root --password="$Pass" shutdown 2>&1 | Out-Null
    }
    Start-Sleep -Seconds 1
    Write-Output "down (alive: $(Alive))"
  }

  "reset" {
    if (Alive) {
      & "$Bin\mariadb-admin.exe" --protocol=TCP --host=127.0.0.1 --port=$Port `
        --user=root --password="$Pass" shutdown 2>&1 | Out-Null
      Start-Sleep -Seconds 2
    }
    if (Test-Path $Root) { Remove-Item -Recurse -Force $Root }
    Write-Output "destroyed $Root"
  }
}
