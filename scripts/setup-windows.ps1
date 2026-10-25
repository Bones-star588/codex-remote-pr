[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js 22.19 or newer is required."
}

$nodeVersion = [Version]((& node -p "process.versions.node").Trim())
if ($nodeVersion -lt [Version]"22.19.0") {
  throw "Node.js 22.19 or newer is required. Current: $nodeVersion"
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  throw "npm.cmd was not found in PATH."
}

Write-Host "==> Installing locked dependencies"
& $npm.Source ci
if ($LASTEXITCODE -ne 0) {
  throw "npm ci failed with exit code $LASTEXITCODE."
}

Write-Host "==> Building"
& $npm.Source run build
if ($LASTEXITCODE -ne 0) {
  throw "npm run build failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path (Join-Path $Root "data\auth.json"))) {
  Write-Host "==> Setting the access password"
  & $npm.Source run set-password
  if ($LASTEXITCODE -ne 0) {
    throw "Password setup failed with exit code $LASTEXITCODE."
  }
} else {
  Write-Host "==> Existing password configuration found"
}

Write-Host ""
Write-Host "Setup complete."
Write-Host "Start with: npm start"
$port = if ($env:PORT) { $env:PORT } else { "4545" }
Write-Host "Open: http://127.0.0.1:$port"
Write-Host "Run at login: npm run install-task:windows"
