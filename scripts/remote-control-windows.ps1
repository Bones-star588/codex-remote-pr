[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Start", "Stop", "Status")]
  [string]$Action,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ServerTaskName = "CodexRemote"
$TunnelTaskName = "CodexRemoteTunnel"

function Get-RemoteTask {
  param([string]$Name)
  $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if ($task -and $task.Actions.WorkingDirectory -ne $Root) {
    throw "Scheduled task $Name belongs to another checkout: $($task.Actions.WorkingDirectory)"
  }
  return $task
}

function Get-RemoteProcesses {
  $entry = Join-Path $Root "dist-server\server\index.js"
  $token = Join-Path $Root "data\cloudflared-token"
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'cloudflared.exe'" |
    Where-Object {
      ($_.Name -eq "node.exe" -and $_.CommandLine.Contains($entry)) -or
      ($_.Name -eq "cloudflared.exe" -and $_.CommandLine.Contains($token))
    }
}

function Wait-HttpReady {
  param([string]$Url, [int]$Seconds = 30)
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return }
    } catch { }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Readiness check timed out: $Url. Check scheduled tasks and data\cloudflared.log."
}

$port = if ($env:PORT) { $env:PORT } else { "4545" }
$publicOrigin = $env:PUBLIC_ORIGIN
$envPath = Join-Path $Root ".env"
if (Test-Path -LiteralPath $envPath) {
  foreach ($line in [System.IO.File]::ReadAllLines($envPath, [System.Text.Encoding]::UTF8)) {
    if (-not $env:PORT -and $line -match '^\s*PORT\s*=\s*["'']?(\d+)') { $port = $Matches[1] }
    if (-not $env:PUBLIC_ORIGIN -and $line -match '^\s*PUBLIC_ORIGIN\s*=\s*["'']?(https?://[^"''\s#]+)') {
      $publicOrigin = $Matches[1]
    }
  }
}
$localUrl = "http://127.0.0.1:$port"

if ($Action -eq "Status") {
  foreach ($name in @($ServerTaskName, $TunnelTaskName)) {
    $task = Get-RemoteTask $name
    if ($task) { Write-Host "$name : $($task.State)" }
    else { Write-Host "$name : not installed" }
  }
  Get-RemoteProcesses | Select-Object Name, ProcessId
  try {
    $health = Invoke-RestMethod -Uri "$localUrl/health" -TimeoutSec 2
    Write-Host "Backend: $($health.codex); transport: $($health.transport)."
  } catch {
    Write-Warning "The local backend is not reachable: $localUrl/health"
  }
  if (Test-Path -LiteralPath (Join-Path $Root "data\cloudflared-token")) {
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:20241/ready" -UseBasicParsing -TimeoutSec 2 | Out-Null
      $metrics = Invoke-WebRequest -Uri "http://127.0.0.1:20241/metrics" -UseBasicParsing -TimeoutSec 2
      if ($metrics.Content -match '(?m)^cloudflared_tunnel_ha_connections\s+(\d+)') {
        Write-Host "Tunnel: ready; edge connections: $($Matches[1])."
      } else {
        Write-Host "Tunnel: ready."
      }
    } catch {
      Write-Warning "The tunnel has no ready edge connection. Check data\cloudflared.log."
    }
  }
  return
}

if ($Action -eq "Stop") {
  foreach ($name in @($TunnelTaskName, $ServerTaskName)) {
    $task = Get-RemoteTask $name
    if ($task) {
      Disable-ScheduledTask -TaskName $name | Out-Null
      Stop-ScheduledTask -TaskName $name
    }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    $remaining = @(Get-RemoteProcesses)
    if ($remaining.Count -eq 0) { break }
    Start-Sleep -Milliseconds 300
  } while ([DateTime]::UtcNow -lt $deadline)
  if ($remaining.Count -gt 0) {
    throw "A Remote process is still running. PID: $($remaining.ProcessId -join ', ')"
  }
  Write-Host "Codex Remote is OFF. Server and tunnel stopped; logon startup disabled."
  return
}

if (-not (Test-Path -LiteralPath (Join-Path $Root "dist-server\server\index.js"))) {
  throw "Build output is missing. Run npm run build in $Root first."
}
$serverTask = Get-RemoteTask $ServerTaskName
$tokenFile = Join-Path $Root "data\cloudflared-token"
$hasTunnel = Test-Path -LiteralPath $tokenFile
if (-not $serverTask -or ($hasTunnel -and -not (Get-RemoteTask $TunnelTaskName))) {
  & (Join-Path $PSScriptRoot "install-task-windows.ps1")
}
Enable-ScheduledTask -TaskName $ServerTaskName | Out-Null
if ((Get-RemoteTask $ServerTaskName).State -ne "Running") {
  Start-ScheduledTask -TaskName $ServerTaskName
}
Wait-HttpReady "$localUrl/health"
if ($hasTunnel) {
  Enable-ScheduledTask -TaskName $TunnelTaskName | Out-Null
  if ((Get-RemoteTask $TunnelTaskName).State -ne "Running") {
    Start-ScheduledTask -TaskName $TunnelTaskName
  }
  Wait-HttpReady "http://127.0.0.1:20241/ready"
}
$health = Invoke-RestMethod -Uri "$localUrl/health" -TimeoutSec 3
Write-Host "Codex Remote is ON. Backend: $($health.codex); transport: $($health.transport)."
if ($health.transport -ne "desktop") {
  Write-Warning "Desktop synchronization is unavailable. Open Codex Desktop with its debug endpoint enabled."
}
$openUrl = if ($hasTunnel -and $publicOrigin) { $publicOrigin } else { $localUrl }
Write-Host "Open: $openUrl"
if (-not $NoBrowser) { Start-Process $openUrl -WindowStyle Hidden }
