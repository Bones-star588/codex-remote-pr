import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { ServerMessage } from '../shared/protocol';
import { RemoteConnection } from './remote-connection';

class FakeSocket extends EventTarget {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    FakeSocket.instances.push(this);
  }

  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  open(): void { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }));
  }
}

describe('Remote connection recovery', () => {
  let browser: EventTarget;
  let documentTarget: EventTarget & { visibilityState: string };
  let network: { onLine: boolean };
  let connection: RemoteConnection;
  let onDisconnect: Mock<(error: Error) => void>;
  let onMessage: Mock<(message: ServerMessage) => void>;
  let onOpen: Mock<() => void>;
  let current: WebSocket | null;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    browser = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
    documentTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    network = { onLine: true };
    vi.stubGlobal('window', browser);
    vi.stubGlobal('document', documentTarget);
    vi.stubGlobal('navigator', network);
    vi.stubGlobal('WebSocket', FakeSocket);
    onDisconnect = vi.fn<(error: Error) => void>();
    onMessage = vi.fn<(message: ServerMessage) => void>();
    onOpen = vi.fn<() => void>();
    current = null;
    connection = new RemoteConnection({
      url: 'wss://remote.test/ws',
      onSocket: (socket) => { current = socket; },
      onOpen, onMessage, onDisconnect
    });
    connection.start();
  });

  afterEach(() => {
    connection.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('replaces an OPEN socket when heartbeats stop returning', () => {
    const first = FakeSocket.instances[0]!;
    first.open();
    first.message({ type: 'pong', at: 'now' });
    vi.advanceTimersByTime(20_000);
    expect(first.sent).toHaveLength(2);
    vi.advanceTimersByTime(10_000);
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(current).toBeNull();
    vi.advanceTimersByTime(1500);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(first.readyState).toBe(3);
  });

  it('times out a stalled handshake and ignores late events from it', () => {
    const first = FakeSocket.instances[0]!;
    vi.advanceTimersByTime(16_500);
    const second = FakeSocket.instances[1]!;
    second.open();
    first.open();
    first.message({ type: 'event', method: 'stale', params: {} });
    first.close();
    expect(current).toBe(second);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onMessage).not.toHaveBeenCalled();
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('probes on foreground return without postponing a pending heartbeat timeout', () => {
    const first = FakeSocket.instances[0]!;
    first.open();
    first.message({ type: 'pong', at: 'now' });
    documentTarget.visibilityState = 'hidden';
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(first.sent).toHaveLength(1);
    documentTarget.visibilityState = 'visible';
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    browser.dispatchEvent(new Event('focus'));
    expect(first.sent).toHaveLength(2);
    vi.advanceTimersByTime(5000);
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('waits while offline and reconnects immediately when the network returns', () => {
    FakeSocket.instances[0]!.open();
    network.onLine = false;
    browser.dispatchEvent(new Event('offline'));
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    network.onLine = true;
    browser.dispatchEvent(new Event('online'));
    expect(FakeSocket.instances).toHaveLength(2);
    const second = FakeSocket.instances[1]!;
    second.open();
    browser.dispatchEvent(new Event('online'));
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('reconnects on errors and never retries or delivers events after disposal', () => {
    const first = FakeSocket.instances[0]!;
    first.dispatchEvent(new Event('error'));
    vi.advanceTimersByTime(1500);
    expect(FakeSocket.instances).toHaveLength(2);
    const second = FakeSocket.instances[1]!;
    second.open();
    connection.dispose();
    second.message({ type: 'pong', at: 'late' });
    browser.dispatchEvent(new Event('online'));
    browser.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(current).toBeNull();
    expect(onMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
