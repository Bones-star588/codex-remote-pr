[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PublicHost,
  [string]$TunnelName = "codexwin",
  [string]$LocalUrl = "http://127.0.0.1:4545"
)

if ($PSVersionTable.PSVersion.Major -lt 7) {
  $pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
  if (-not $pwsh) {
    throw "PowerShell 7 is required for safe JSON argument forwarding to cf."
  }
  & $pwsh.Source -NoProfile -File $PSCommandPath @PSBoundParameters
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$cf = Get-Command cf -ErrorAction SilentlyContinue
if (-not $cf) {
  throw "The Cloudflare cf CLI is required."
}

$cloudflaredPath = Join-Path $env:ProgramFiles "cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
  $cloudflaredPath = Join-Path ${env:ProgramFiles(x86)} "cloudflared\cloudflared.exe"
}
if (-not (Test-Path $cloudflaredPath)) {
  $cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
  if (-not $cloudflaredCommand) {
    throw "cloudflared is required. Install it first and make sure it is in PATH."
  }
  $cloudflaredPath = $cloudflaredCommand.Source
}

$zones = @(& cf zones list | Out-String | ConvertFrom-Json)
$zone = $zones |
  Where-Object { $PublicHost -eq $_.name -or $PublicHost.EndsWith(".$($_.name)") } |
  Sort-Object { $_.name.Length } -Descending |
  Select-Object -First 1
if (-not $zone) {
  throw "$PublicHost is not inside a Cloudflare zone available to this account."
}

$tunnels = @(& cf tunnels list --name $TunnelName | Out-String | ConvertFrom-Json)
$tunnel = $tunnels | Where-Object { $_.name -eq $TunnelName -and -not $_.deleted_at } | Select-Object -First 1
if (-not $tunnel) {
  Write-Host "==> Creating remotely managed tunnel $TunnelName"
  $tunnel = & cf tunnels create --name $TunnelName --config-src cloudflare | Out-String | ConvertFrom-Json
}
if (-not $tunnel.id) {
  throw "Unable to resolve tunnel id for $TunnelName."
}

$configuration = @{
  config = @{
    ingress = @(
      @{
        hostname = $PublicHost
        service = $LocalUrl
      },
      @{
        service = "http_status:404"
      }
    )
  }
} | ConvertTo-Json -Depth 8 -Compress

Write-Host "==> Updating tunnel ingress"
& cf tunnels config update $tunnel.id --body $configuration | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Unable to update tunnel configuration."
}

$records = @(& cf dns records list -z $zone.name | Out-String | ConvertFrom-Json)
$record = $records | Where-Object { $_.name -eq $PublicHost } | Select-Object -First 1
$target = "$($tunnel.id).cfargotunnel.com"
if ($record) {
  if ($record.type -ne "CNAME" -or $record.content -ne $target) {
    throw "$PublicHost already has a different DNS record. It was not changed."
  }
} else {
  Write-Host "==> Creating DNS record $PublicHost"
  $recordBody = @{
    type = "CNAME"
    name = $PublicHost
    content = $target
    proxied = $true
    ttl = 1
  } | ConvertTo-Json -Compress
  & cf dns records create -z $zone.name --body $recordBody | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to create the DNS record."
  }
}

Write-Host "==> Saving tunnel token"
$tokenResponse = & cf tunnels token get $tunnel.id | Out-String | ConvertFrom-Json
$token = if ($tokenResponse -is [string]) {
  $tokenResponse
} elseif ($tokenResponse.token) {
  $tokenResponse.token
} elseif ($tokenResponse.result.token) {
  $tokenResponse.result.token
} elseif ($tokenResponse.result -is [string]) {
  $tokenResponse.result
} else {
  $null
}
if (-not $token) {
  throw "Unable to read the tunnel token. No token was written."
}

$dataDir = Join-Path $Root "data"
$tokenFile = Join-Path $dataDir "cloudflared-token"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$existingToken = if (Test-Path $tokenFile) {
  [System.IO.File]::ReadAllText($tokenFile)
} else {
  $null
}
if ($existingToken -ne $token) {
  if (Test-Path $tokenFile) {
    & icacls.exe $tokenFile /inheritance:r /grant:r "${currentUser}:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to update the existing tunnel token file."
    }
  }
  [System.IO.File]::WriteAllText($tokenFile, $token, [System.Text.UTF8Encoding]::new($false))
}
& icacls.exe $tokenFile /inheritance:r /grant:r "${currentUser}:(R)" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Unable to restrict access to the tunnel token file."
}

$envFile = Join-Path $Root ".env"
$envLines = if (Test-Path $envFile) { @(Get-Content -LiteralPath $envFile) } else { @() }
$envLines = @($envLines | Where-Object { $_ -notmatch '^PUBLIC_ORIGIN=' -and $_ -notmatch '^ALLOWED_ORIGINS=' })
$envLines += "PUBLIC_ORIGIN=https://$PublicHost"
$envLines += "ALLOWED_ORIGINS=https://$PublicHost"
[System.IO.File]::WriteAllLines($envFile, [string[]]$envLines, [System.Text.UTF8Encoding]::new($false))

Write-Host "==> Registering tunnel logon task"
& (Join-Path $PSScriptRoot "install-task-windows.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Unable to register the Windows logon task."
}

Write-Host "Tunnel complete."
Write-Host "Open: https://$PublicHost"
