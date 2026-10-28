$ErrorActionPreference = "Stop"
$addressEvent = "CodexRemoteAddress-$PID"
$availabilityEvent = "CodexRemoteAvailability-$PID"
try {
  Register-ObjectEvent -InputObject ([System.Net.NetworkInformation.NetworkChange]) `
    -EventName NetworkAddressChanged -SourceIdentifier $addressEvent | Out-Null
  Register-ObjectEvent -InputObject ([System.Net.NetworkInformation.NetworkChange]) `
    -EventName NetworkAvailabilityChanged -SourceIdentifier $availabilityEvent | Out-Null
  while ($true) {
    $event = Wait-Event -Timeout 30
    if ($event) {
      [Console]::WriteLine("network")
      Get-Event | Remove-Event
    }
  }
} finally {
  Unregister-Event -SourceIdentifier $addressEvent -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $availabilityEvent -ErrorAction SilentlyContinue
}
