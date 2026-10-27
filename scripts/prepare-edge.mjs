import fs from 'node:fs/promises';
import path from 'node:path';

const hostname = process.env.REMOTE_EDGE_HOST;
const zone = process.env.REMOTE_EDGE_ZONE;
if (!hostname || !zone || !hostname.endsWith(`.${zone}`)) {
  throw new Error('Set REMOTE_EDGE_HOST and REMOTE_EDGE_ZONE to your existing Remote hostname and zone.');
}
const root = process.cwd();
const output = path.resolve(root, '.cloudflare/output');
if (path.relative(root, output) !== path.join('.cloudflare', 'output')) throw new Error('Invalid build output.');
await fs.rm(output, { recursive: true, force: true });
const target = path.join(output, 'v0/workers/default');
await fs.mkdir(target, { recursive: true });
await fs.cp(path.resolve('dist/client'), path.join(target, 'assets'), { recursive: true });
const staticPaths = ['/', '/index.html', '/assets/*', '/licenses/*', '/codex-mark.svg', '/icon-192.png',
  '/icon-512.png', '/manifest.webmanifest', '/sw.js'];
await fs.writeFile(path.join(output, 'v0/config.json'), JSON.stringify({ buildContext: { isPreview: false } }));
await fs.writeFile(path.join(target, 'worker.config.json'), JSON.stringify({
  name: 'codex-remote-static',
  compatibilityDate: '2026-10-26',
  assets: { htmlHandling: 'auto-trailing-slash', notFoundHandling: 'none' },
  workersDev: false,
  observability: { enabled: true, redactQueryString: true,
    logs: { enabled: true, headSamplingRate: 0.01 }, traces: { enabled: true, headSamplingRate: 0.01 } },
  triggers: staticPaths.map(suffix => ({ type: 'fetch', pattern: hostname + suffix, zone }))
}));
console.log('Static edge build prepared. API, WebSocket and health routes remain on the existing origin.');
