import type { Plugin } from 'vite';

export function serviceWorkerSource(files: string[], version: string): string {
  return `
const CACHE = ${JSON.stringify(`codex-static-${version}`)};
const FILES = ${JSON.stringify(files)};
const isStatic = url => url.origin === self.location.origin &&
  (url.pathname.startsWith('/assets/') || FILES.includes(url.pathname));
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => Promise.all(FILES.map(async path => {
    const response = await fetch(path, { cache: 'reload', credentials: 'omit', priority: 'low' });
    if (!response.ok) throw new Error('Application cache is incomplete.');
    await cache.put(path, response);
  })))
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key =>
    key.startsWith('codex-static-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !isStatic(url) || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      // Keep the shell and its modules in the same installed version.
      // Registration updates install the next version in the background.
      const cached = await (await caches.open(CACHE)).match('/');
      return cached || fetch(request);
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
    return response;
  })());
});
`;
}

export function pwaPlugin(): Plugin {
  return {
    name: 'remote-static-cache',
    apply: 'build',
    transformIndexHtml(_html, context) {
      const workspace = Object.values(context.bundle ?? {}).find(
        value => value.type === 'chunk' && value.name === 'Workspace'
      );
      return workspace ? [{ tag: 'link', attrs: {
        rel: 'modulepreload', crossorigin: '', href: `/${workspace.fileName}`
      }, injectTo: 'head' }] : [];
    },
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(value => value.type === 'chunk' && value.isEntry);
      if (!entry) return;
      const files = ['/', '/codex-mark.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest',
        ...Object.keys(bundle).filter(name => /\.(js|css)$/.test(name) && !/^assets\/(?:TerminalPanel|FilePreview|PdfPreview)/.test(name))
          .map(name => `/${name}`)];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(files, entry.fileName) });
    }
  };
}
