import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpChannel } from './http-channel';

class FakeEventSource extends EventTarget {
  static current: FakeEventSource;
  close = vi.fn();
  constructor(readonly url: string) { super(); FakeEventSource.current = this; }
  open(): void { this.dispatchEvent(new Event('open')); }
  message(message: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

describe('HTTP channel request isolation', () => {
  let channel: HttpChannel;
  let messages: unknown[];
  const accepted = () => ({ ok: true, status: 202, text: async () => '' });
  const sent = () => vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(accepted()));
    messages = [];
    channel = new HttpChannel('/api/connection');
    channel.addEventListener('message', event => messages.push(JSON.parse((event as MessageEvent).data)));
    FakeEventSource.current.open();
  });

  afterEach(() => {
    channel.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects only a failed RPC while keeping healthy events and later requests available', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    channel.send('{"type":"rpc","id":"first","method":"turn/start"}');
    await vi.advanceTimersByTimeAsync(0);
    expect(messages).toEqual([expect.objectContaining({ type: 'rpc.error', id: 'first' })]);
    expect(sent()).toHaveLength(1);
    expect(channel.readyState).toBe(1);
    expect(FakeEventSource.current.close).not.toHaveBeenCalled();
    FakeEventSource.current.message({ type: 'event', method: 'item/completed' });
    channel.send('{"type":"rpc","id":"later","method":"thread/read"}');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent()).toHaveLength(2);
    expect(messages.at(-1)).toEqual({ type: 'event', method: 'item/completed' });
  });

  it('reports an unconfirmed approval without retrying it or closing events', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Network unavailable'));
    channel.send('{"type":"server.request.respond","requestId":"approval","result":"accept"}');
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent()).toHaveLength(1);
    expect(messages).toEqual([expect.objectContaining({ type: 'server.request.failed', requestId: 'approval' })]);
    expect(channel.readyState).toBe(1);
  });

  it.each([401, 409])('closes when HTTP %i invalidates the authenticated peer', async status => {
    const error = vi.fn();
    channel.addEventListener('error', error);
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status } as Response);
    channel.send('{"type":"rpc","id":"read","method":"thread/read"}');
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.readyState).toBe(3);
    expect(FakeEventSource.current.close).toHaveBeenCalledOnce();
    expect((error.mock.calls[0]![0] as Event & { error: { status: number } }).error.status).toBe(status);
    expect(messages).toEqual([]);
  });

  it('keeps mutation order while reads, subscriptions and pings bypass a stalled action receipt', async () => {
    let acceptFirst!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { acceptFirst = resolve; }));
    channel.send('{"type":"rpc","id":"first","method":"turn/start"}');
    channel.send('{"type":"rpc","id":"second","method":"turn/steer"}');
    await vi.advanceTimersByTimeAsync(0);
    channel.send('{"type":"rpc","id":"read","method":"thread/resume"}');
    channel.send('{"type":"thread.watch","threadId":"selected"}');
    channel.send('{"type":"ping"}');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent().map(message => message.id ?? message.type)).toEqual(['first', 'read', 'ping', 'thread.watch']);
    acceptFirst(accepted() as Response);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent().map(message => message.id ?? message.type)).toEqual(['first', 'read', 'ping', 'thread.watch', 'second']);
    expect(channel.readyState).toBe(1);
  });

  it('retries safe controls finitely and preserves synchronization before the latest watch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    channel.send('{"type":"sync.resume","epoch":null,"after":0,"threadId":null}');
    channel.send('{"type":"thread.watch","threadId":"old"}');
    channel.send('{"type":"thread.watch","threadId":"latest"}');
    await vi.advanceTimersByTimeAsync(499);
    expect(sent()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent().map(message => message.type)).toEqual(['sync.resume', 'sync.resume', 'thread.watch']);
    expect(sent().at(-1).threadId).toBe('latest');
    expect(channel.readyState).toBe(1);
    expect(messages).toEqual([]);
  });

  it('does not replay a superseded watch after its failed receipt', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    channel.send('{"type":"thread.watch","threadId":"old"}');
    await vi.advanceTimersByTimeAsync(0);
    channel.send('{"type":"thread.watch","threadId":"latest"}');
    await vi.advanceTimersByTimeAsync(500);
    expect(sent().map(message => message.threadId)).toEqual(['old', 'latest']);
  });

  it('reports exhausted control retries without destroying a healthy event stream', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response);
    channel.send('{"type":"thread.watch","threadId":"selected"}');
    await vi.advanceTimersByTimeAsync(1500);
    expect(sent()).toHaveLength(3);
    expect(messages).toEqual([expect.objectContaining({ type: 'error' })]);
    expect(channel.readyState).toBe(1);
    FakeEventSource.current.message({ type: 'pong' });
    expect(messages.at(-1)).toEqual({ type: 'pong' });
  });

  it('does not close healthy events or replay a model action when its receipt times out', async () => {
    vi.mocked(fetch).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
    }));
    channel.send('{"type":"rpc","id":"uncertain","method":"turn/start"}');
    await vi.advanceTimersByTimeAsync(12000);
    expect(messages).toEqual([expect.objectContaining({ type: 'rpc.error', id: 'uncertain' })]);
    expect(sent()).toHaveLength(1);
    expect(channel.readyState).toBe(1);
  });

  it('never retries unknown RPC methods and cancels safe retry waits on disposal', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    channel.send('{"type":"rpc","id":"unknown","method":"future/action"}');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent()).toHaveLength(1);
    expect(messages).toEqual([expect.objectContaining({ type: 'rpc.error', id: 'unknown' })]);
    channel.send('{"type":"ping"}');
    await vi.advanceTimersByTimeAsync(0);
    channel.close();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent()).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
