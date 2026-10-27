import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortedRequest, ReadRequests } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('selection-scoped HTTP reads', () => {
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
