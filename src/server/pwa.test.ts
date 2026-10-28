import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { serviceWorkerSource } from '../../scripts/pwa.js';

function worker(shell: Response | undefined) {
  const handlers = new Map<string, (event: unknown) => void>();
  const cache = { match: vi.fn(async () => shell), put: vi.fn(async () => {}) };
  const fetch = vi.fn(async () => new Response('network-shell'));
  runInNewContext(serviceWorkerSource(['/', '/assets/entry.js'], 'current'), {
    self: { location: { origin: 'https://remote.example' }, addEventListener: (name: string, handler: (event: unknown) => void) =>
      handlers.set(name, handler) },
    caches: { open: vi.fn(async () => cache), match: vi.fn(async () => shell) },
    fetch, URL
  });
  const request = (path: string, mode = 'navigate') => {
    let response: Promise<Response> | undefined;
    handlers.get('fetch')!({
      request: { url: `https://remote.example${path}`, method: 'GET', mode },
      respondWith: (result: Promise<Response>) => { response = result; }
    });
    return response;
  };
  return { request, fetch, cache };
}

describe('installed static shell', () => {
  it('returns the installed version immediately without a network race', async () => {
    const installed = new Response('installed-shell');
    const { request, fetch, cache } = worker(installed);
    expect(await request('/')).toBe(installed);
    expect(cache.match).toHaveBeenCalledWith('/');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the network when the shell was evicted', async () => {
    const { request, fetch } = worker(undefined);
    expect(await (await request('/'))!.text()).toBe('network-shell');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('never intercepts authenticated API and media requests', () => {
    const { request, cache, fetch } = worker(new Response('public-shell'));
    expect(request('/api/bootstrap', 'cors')).toBeUndefined();
    expect(request('/api/threads', 'cors')).toBeUndefined();
    expect(request('/api/local-image', 'cors')).toBeUndefined();
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
