import { performance } from 'node:perf_hooks';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:4545');
const samples = Number(process.argv[3] || 10);
if (!Number.isInteger(samples) || samples < 2 || samples > 100) throw new Error('Use 2 to 100 samples.');
for (const pathname of ['/', '/health']) {
  const durations = [];
  let failures = 0;
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    try {
      const response = await fetch(new URL(pathname, origin), { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      durations.push(Math.round(performance.now() - start));
    } catch { failures++; }
  }
  durations.sort((a, b) => a - b);
  const percentile = value => durations.length ? durations[Math.max(0, Math.ceil(durations.length * value) - 1)] : null;
  console.log(JSON.stringify({ origin: origin.origin, pathname, samples,
    successes: durations.length, failures, medianMs: percentile(0.5), p95Ms: percentile(0.95) }));
}
