import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { serviceWorkerSource } from '../../scripts/pwa.js';

function worker(shell: Response | undefined) {
  const handlers = new Map<string, (event: unknown) => void>();
  const cache = { match: vi.fn(async () => shell), put: vi.fn(async () => {}) };
  const fetch = vi.fn(async () => new Response('network-shell'));
  const showNotification = vi.fn(async () => {});
  const clients = { matchAll: vi.fn(async () => [] as Array<{
    url: string; focus: () => Promise<void>; postMessage: (message: unknown) => void;
  }>), openWindow: vi.fn(async (_url: string) => {}) };
  runInNewContext(serviceWorkerSource(['/', '/assets/entry.js'], 'current'), {
    self: { location: { origin: 'https://remote.example' }, registration: { showNotification }, clients,
      addEventListener: (name: string, handler: (event: unknown) => void) =>
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
  return { request, fetch, cache, handlers, clients, showNotification };
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

describe('device push notifications', () => {
  it('displays a background notification and opens the matching chat in an existing workspace', async () => {
    const { handlers, showNotification, clients, cache } = worker(undefined);
    let pending!: Promise<unknown>;
    handlers.get('push')!({
      data: { json: () => ({ title: 'Codex', body: 'Task completed', tag: 'turn-a', url: '/?thread=a' }) },
      waitUntil: (promise: Promise<unknown>) => { pending = promise; }
    });
    await pending;
    expect(showNotification).toHaveBeenCalledWith('Codex', expect.objectContaining({
      body: 'Task completed', data: { url: '/?thread=a' }
    }));
    const client = { url: 'https://remote.example/', focus: vi.fn(async () => {}),
      postMessage: vi.fn() };
    clients.matchAll.mockResolvedValue([client]);
    const close = vi.fn();
    handlers.get('notificationclick')!({
      notification: { close, data: { url: '/?thread=a' } },
      waitUntil: (promise: Promise<unknown>) => { pending = promise; }
    });
    await pending;
    expect(close).toHaveBeenCalledOnce();
    expect(client.focus).toHaveBeenCalledOnce();
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'notification.open', threadId: 'a' });
    expect(clients.openWindow).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('opens a closed workspace on notification tap and keeps navigation on its own origin', async () => {
    const { handlers, clients } = worker(undefined);
    let pending!: Promise<unknown>;
    const tap = async (url: string) => {
      handlers.get('notificationclick')!({
        notification: { close: () => {}, data: { url } },
        waitUntil: (promise: Promise<unknown>) => { pending = promise; }
      });
      await pending;
    };
    await tap('/?thread=chat%20a');
    expect(clients.openWindow).toHaveBeenLastCalledWith('https://remote.example/?thread=chat%20a');
    await tap('https://elsewhere.example/');
    expect(clients.openWindow).toHaveBeenLastCalledWith('https://remote.example/');
  });
});
