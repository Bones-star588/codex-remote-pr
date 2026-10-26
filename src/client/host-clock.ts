let offsetMs = 0;

export function synchronizeHostClock(serverTimeMs: number, sentAtMs: number, receivedAtMs: number): void {
  offsetMs = serverTimeMs - (sentAtMs + receivedAtMs) / 2;
}

export function hostNow(): number {
  return Date.now() + offsetMs;
}
