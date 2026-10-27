[CmdletBinding()]
param(
  [switch]$Unregister,
  [ValidateSet("auto", "http2", "quic")]
  [string]$TunnelProtocol = "http2"
)

$ErrorActionPreference = "Stop"
$ServerTaskName = "CodexRemote"
$TunnelTaskName = "CodexRemoteTunnel"

if ($env:OS -ne "Windows_NT") {
  throw "This script is only supported on Windows."
}

if ($Unregister) {
  foreach ($taskName in @($ServerTaskName, $TunnelTaskName)) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  }
  Write-Host "Removed Codex Remote scheduled tasks."
  return
}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser

function Register-CodexRemoteTask {
  param(
    [string]$TaskName,
    [string]$Executable,
    [string]$Arguments,
    [string]$Description
  )

  $action = New-ScheduledTaskAction `
    -Execute $Executable `
    -Argument $Arguments `
    -WorkingDirectory $Root
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description $Description `
    -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Installed and started scheduled task $TaskName."
}

$entryPoint = Join-Path $Root "dist-server\server\index.js"
if (-not (Test-Path $entryPoint)) {
  throw "Build output is missing. Run npm run build first."
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "node was not found in PATH."
}

Register-CodexRemoteTask `
  -TaskName $ServerTaskName `
  -Executable $node.Source `
  -Arguments "`"$entryPoint`"" `
  -Description "Codex Remote local server"

$tokenFile = Join-Path $Root "data\cloudflared-token"
if (Test-Path $tokenFile) {
  $cloudflaredPath = Join-Path $env:ProgramFiles "cloudflared\cloudflared.exe"
  if (-not (Test-Path $cloudflaredPath)) {
    $cloudflaredPath = Join-Path ${env:ProgramFiles(x86)} "cloudflared\cloudflared.exe"
  }
  if (-not (Test-Path $cloudflaredPath)) {
    $cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
    if (-not $cloudflaredCommand) {
      throw "cloudflared is required for the tunnel task."
    }
    $cloudflaredPath = $cloudflaredCommand.Source
  }

  Register-CodexRemoteTask `
    -TaskName $TunnelTaskName `
    -Executable $cloudflaredPath `
    -Arguments "tunnel --protocol $TunnelProtocol --no-autoupdate --metrics 127.0.0.1:20241 --loglevel info --logfile `"$(Join-Path $Root 'data\cloudflared.log')`" run --token-file `"$tokenFile`"" `
    -Description "Codex Remote Cloudflare Tunnel"
}

$port = if ($env:PORT) { $env:PORT } else { "4545" }
Write-Host "Open: http://127.0.0.1:$port"
Write-Host "Remove with: npm run uninstall-task:windows"
