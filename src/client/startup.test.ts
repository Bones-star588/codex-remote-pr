import { afterEach, describe, expect, it, vi } from 'vitest';
import { isReturningDevice, rememberDevice, startSession } from './startup';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const state = { configured: true, authenticated: true, setupAllowed: false };
const workspace = { threads: { data: [], nextCursor: null }, models: null, projects: null };

describe('returning device shell hint', () => {
  it('remembers successful verification and clears the hint on expiry or logout', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    expect(isReturningDevice()).toBe(false);
    rememberDevice(true);
    expect(isReturningDevice()).toBe(true);
    expect([...values.values()]).toEqual(['1']);
    rememberDevice(false);
    expect(isReturningDevice()).toBe(false);
  });

  it('falls back to verified entry when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage unavailable'); },
      setItem: () => { throw new Error('Storage unavailable'); },
      removeItem: () => { throw new Error('Storage unavailable'); }
    });
    expect(isReturningDevice()).toBe(false);
    expect(() => rememberDevice(true)).not.toThrow();
    expect(() => rememberDevice(false)).not.toThrow();
  });
});

describe('independent startup reads', () => {
  it('starts both reads immediately and opens from bootstrap when status stalls', async () => {
    const signals: AbortSignal[] = [];
    const fetch = vi.fn((path: string, options: RequestInit) => {
      signals.push(options.signal!);
      return path === '/api/bootstrap' ? Promise.resolve(Response.json({ ...state, workspace }))
        : new Promise<Response>((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(options.signal!.reason)));
    });
    vi.stubGlobal('fetch', fetch);
    const session = startSession(new AbortController().signal);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/bootstrap', '/api/auth/status']);
    expect(await session.auth).toMatchObject(state);
    expect(await session.workspace).toEqual(workspace);
    expect(signals[1]!.aborted).toBe(true);
    expect(signals[0]!.aborted).toBe(false);
  });

  it('opens from status without waiting for task metadata', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((path: string) => path === '/api/bootstrap'
      ? new Promise<Response>(resolve => { finish = resolve; })
      : Promise.resolve(Response.json(state))));
    const session = startSession(new AbortController().signal);
    expect(await session.auth).toEqual(state);
    finish(Response.json({ ...state, workspace }));
    expect(await session.workspace).toEqual(workspace);
  });

  it('uses server unauthenticated state without exposing a workspace', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ...state, authenticated: false, workspace: null
    })));
    const session = startSession(new AbortController().signal);
    expect(await session.auth).toHaveProperty('authenticated', false);
    expect(await session.workspace).toBeNull();
  });

  it('uses the verified login response without another status round trip', async () => {
    const fetch = vi.fn(async () => Response.json({ ...state, workspace }));
    vi.stubGlobal('fetch', fetch);
    const session = startSession(new AbortController().signal, true);
    expect(await session.auth).toEqual(state);
    expect(await session.workspace).toEqual(workspace);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/bootstrap', expect.anything());
  });

  it('bounds both stalled reads and allows a fresh attempt', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => new Promise<Response>((_resolve, reject) =>
      options.signal!.addEventListener('abort', () => reject(options.signal!.reason)))));
    const session = startSession(new AbortController().signal);
    const failed = session.auth.catch(error => error);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await failed).toBeInstanceOf(AggregateError);
    expect(await session.workspace).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...state, workspace })));
    expect(await startSession(new AbortController().signal).auth).toMatchObject(state);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels abandoned checks without affecting the next attempt', async () => {
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => new Promise<Response>((_resolve, reject) =>
      options.signal!.addEventListener('abort', () => reject(options.signal!.reason)))));
    const controller = new AbortController();
    const session = startSession(controller.signal);
    const failed = session.auth.catch(error => error);
    controller.abort();
    expect(await failed).toBeInstanceOf(AggregateError);
    expect(await session.workspace).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...state, workspace })));
    expect(await startSession(new AbortController().signal).auth).toMatchObject(state);
  });

  it('keeps cancellation wired when bootstrap fails before status settles', async () => {
    let statusSignal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn((path: string, options: RequestInit) => {
      if (path === '/api/bootstrap') return Promise.reject(new TypeError('Network unavailable'));
      statusSignal = options.signal!;
      return new Promise<Response>((_resolve, reject) =>
        statusSignal.addEventListener('abort', () => reject(statusSignal.reason)));
    }));
    const controller = new AbortController();
    const session = startSession(controller.signal);
    const failed = session.auth.catch(error => error);
    await session.workspace;
    controller.abort();
    expect(await failed).toBeInstanceOf(AggregateError);
    expect(statusSignal.aborted).toBe(true);
  });
});
