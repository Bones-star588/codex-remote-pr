let interactiveUntil = 0;
let foregroundReads = 0;

export function beginForegroundRead(): () => void {
  foregroundReads += 1;
  return () => { foregroundReads -= 1; };
}

export function prioritizeInteraction(): void {
  interactiveUntil = performance.now() + 600;
}

export function constrainedNetwork(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return Boolean(connection?.saveData || /(^|-)2g$|3g/.test(connection?.effectiveType ?? ''));
}

export async function yieldToInteraction(signal?: AbortSignal): Promise<void> {
  do {
    const delay = document.visibilityState === 'hidden' ? 1000
      : Math.max(constrainedNetwork() ? 400 : 20, interactiveUntil - performance.now());
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      const abort = () => { clearTimeout(timer); reject(signal?.reason); };
      const timer = window.setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, delay);
      signal?.addEventListener('abort', abort, { once: true });
    });
  } while (foregroundReads > 0 || document.visibilityState === 'hidden' || performance.now() < interactiveUntil);
}
