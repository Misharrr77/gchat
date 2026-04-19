# Том /app/data + redeploy. Нужен RAILWAY_TOKEN (см. .env.railway.example).
# Из корня репозитория: pwsh ./scripts/railway-volume-and-redeploy.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (Test-Path ".env.railway") {
  Get-Content ".env.railway" | ForEach-Object {
    if ($_ -match '^\s*RAILWAY_TOKEN\s*=\s*(.+)\s*$') {
      $env:RAILWAY_TOKEN = $matches[1].Trim().Trim('"').Trim("'")
    }
    if ($_ -match '^\s*RAILWAY_PROJECT_ID\s*=\s*(.+)\s*$') {
      $env:RAILWAY_PROJECT_ID = $matches[1].Trim().Trim('"').Trim("'")
    }
  }
}

if (-not $env:RAILWAY_TOKEN) {
  Write-Host "Ошибка: задайте RAILWAY_TOKEN в .env.railway или в окружении (railway.com/account/tokens)." -ForegroundColor Red
  exit 1
}

$npx = "npx"
$rail = "@railway/cli@latest"

& $npx $rail whoami
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path ".railway") -and $env:RAILWAY_PROJECT_ID) {
  & $npx $rail link -p $env:RAILWAY_PROJECT_ID
}

if (-not (Test-Path ".railway")) {
  Write-Host "Один раз выполните в этой папке: npx @railway/cli link   (выберите проект gchat)" -ForegroundColor Yellow
  Write-Host "или добавьте в .env.railway строку RAILWAY_PROJECT_ID=..." -ForegroundColor Yellow
  exit 1
}

Write-Host "`n>>> volume add /app/data" -ForegroundColor Cyan
& $npx $rail volume add --mount-path "/app/data"
# если том уже есть, CLI может вернуть ошибку — это ожидаемо

Write-Host "`n>>> redeploy" -ForegroundColor Cyan
& $npx $rail redeploy -y

Write-Host "`nГотово." -ForegroundColor Green
