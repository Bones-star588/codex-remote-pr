import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, HttpError, isAbortedRequest, ReadRequests } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded connection checks', () => {
  it('aborts a stalled download and permits a new request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) =>
      new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(options.signal!.reason)))));
    const stalled = api('/api/auth/status', { timeoutMs: 6000 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await stalled).toHaveProperty('name', 'TimeoutError');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ authenticated: true })));
    expect(await api('/api/auth/status', { timeoutMs: 6000 })).toEqual({ authenticated: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the deadline active through the response body and preserves caller cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_path: string, options: RequestInit) => ({
      ok: true, text: () => new Promise((_resolve, reject) =>
        options.signal!.addEventListener('abort', () => reject(options.signal!.reason)))
    })));
    const stalled = api('/api/file-preview', { timeoutMs: 15000 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await stalled).toHaveProperty('name', 'TimeoutError');
    const controller = new AbortController();
    const cancelled = api('/api/auth/status', { signal: controller.signal, timeoutMs: 6000 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(isAbortedRequest(await cancelled)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('selection-scoped HTTP reads', () => {
  it('expires a stalled chat read and preserves HTTP auth failures for session recovery', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) =>
      new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(options.signal!.reason)))));
    const reads = new ReadRequests();
    const expired = reads.get('/api/thread/open?threadId=a').catch(error => error);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await expired).toHaveProperty('name', 'TimeoutError');
    expect(reads.has('/api/thread/open?threadId=a')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Sign in again' }, { status: 401 })));
    const failure = await reads.get('/api/threads').catch(error => error);
    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).toHaveProperty('status', 401);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('shares pending reads and re-reads completed data', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const reads = new ReadRequests();
    const first = reads.get('/api/thread/open?threadId=a');
    const duplicate = reads.get('/api/thread/open?threadId=a');
    expect(duplicate).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(Response.json({ id: 'a' }));
    expect(await duplicate).toEqual({ id: 'a' });
    const fresh = reads.get('/api/thread/open?threadId=a');
    expect(fetch).toHaveBeenCalledTimes(2);
    finish(Response.json({ id: 'updated' }));
    expect(await fresh).toEqual({ id: 'updated' });
  });

  it('aborts abandoned downloads without cancelling the replacement', async () => {
    const signals: AbortSignal[] = [];
    const finishers: Array<(response: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => {
      const signal = options.signal!;
      signals.push(signal);
      return new Promise<Response>((resolve, reject) => {
        finishers.push(resolve);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }));
    const reads = new ReadRequests();
    const old = reads.get('/api/thread/history?threadId=a').catch(error => error);
    reads.cancel();
    const replacement = reads.get('/api/thread/history?threadId=a');
    expect(isAbortedRequest(await old)).toBe(true);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
    expect(reads.has('/api/thread/history?threadId=a')).toBe(true);
    finishers[1]!(Response.json({ items: ['replacement'] }));
    expect(await replacement).toEqual({ items: ['replacement'] });
  });

  it('retries failed reads and keeps different page cursors separate', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ items: ['older'] }));
    vi.stubGlobal('fetch', fetch);
    const reads = new ReadRequests();
    await expect(reads.get('/api/thread/history?threadId=a')).rejects.toThrow('Unavailable');
    expect(isAbortedRequest(new Error('Unavailable'))).toBe(false);
    await reads.get('/api/thread/history?threadId=a');
    expect(await reads.get('/api/thread/history?threadId=a&before=next')).toEqual({ items: ['older'] });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
