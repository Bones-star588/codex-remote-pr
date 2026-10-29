import { afterEach, describe, expect, it, vi } from 'vitest';

// A small effect runner keeps this integration test independent of a browser/DOM.
const hooks = vi.hoisted(() => {
  type Slot = { value?: any; deps?: unknown[]; cleanup?: void | (() => void) };
  class Scope {
    slots: Slot[] = [];
    effects: (() => void)[] = [];
    cursor = 0;
    dirty = true;
    root: () => void = () => {};
    slot() { return this.slots[this.cursor++] ?? (this.slots[this.cursor - 1] = {}); }
    render() {
      for (let pass = 0; this.dirty && pass < 20; pass++) {
        this.dirty = false;
        this.cursor = 0;
        hooks.active = this;
        this.root();
        this.effects.splice(0).forEach(effect => effect());
      }
      if (this.dirty) throw new Error('Hook rendering did not settle.');
    }
    dispose() { this.slots.forEach(slot => slot.cleanup?.()); }
  }
  const changed = (a: unknown[] | undefined, b: unknown[] | undefined) => !a || !b ||
    a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
  return { Scope, changed, active: null as Scope | null };
});
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: any) {
    const scope = hooks.active!, slot = scope.slot();
    if (!('value' in slot)) slot.value = typeof initial === 'function' ? initial() : initial;
    return [slot.value, (update: any) => {
      const next = typeof update === 'function' ? update(slot.value) : update;
      if (!Object.is(slot.value, next)) { slot.value = next; scope.dirty = true; }
    }];
  },
  useRef(initial: any) {
    const slot = hooks.active!.slot();
    return slot.value ??= { current: initial };
  },
  useMemo(create: () => any, deps: unknown[]) {
    const slot = hooks.active!.slot();
    if (hooks.changed(slot.deps, deps)) { slot.value = create(); slot.deps = deps; }
    return slot.value;
  },
  useCallback(callback: any, deps: unknown[]) {
    const slot = hooks.active!.slot();
    if (hooks.changed(slot.deps, deps)) { slot.value = callback; slot.deps = deps; }
    return slot.value;
  },
  useEffect(effect: () => void | (() => void), deps: unknown[]) {
    const scope = hooks.active!, slot = scope.slot();
    if (hooks.changed(slot.deps, deps)) {
      slot.deps = deps;
      scope.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
    }
  }
}));
const connection = vi.hoisted(() => ({ options: null as any }));
vi.mock('./remote-connection', () => ({ RemoteConnection: class {
  constructor(options: unknown) { connection.options = options; }
  start() {} dispose() {} reconnect() {}
} }));
vi.mock('./device-snapshots', () => ({
  readDeviceWorkspace: async () => null, readDeviceChat: async () => null,
  saveDeviceWorkspace: async () => {}, saveDeviceChat: async () => {}, removeDeviceChat: async () => {}
}));
vi.mock('./background-work', () => ({
  prioritizeInteraction: () => {}, beginForegroundRead: () => () => {}, constrainedNetwork: () => false,
  yieldToInteraction: () => new Promise(() => {})
}));
import { useRemote } from './useRemote';
import { QueuedMessages } from './components/QueuedMessages';
import type { Thread, WorkspaceBootstrap } from './types';

let scope: InstanceType<typeof hooks.Scope>;
afterEach(() => { scope?.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const thread = { id: 'synthetic-chat', status: { type: 'active' }, updatedAt: 1 } as Thread;

async function settle() {
  for (let pass = 0; pass < 10; pass++) { await Promise.resolve(); scope.render(); }
}

const goal = { threadId: thread.id, objective: 'Synthetic goal', status: 'active', tokenBudget: null,
  tokensUsed: 10, timeUsedSeconds: 5, createdAt: 1, updatedAt: 10 };
const queued = { id: 'q', clientUserMessageId: 'u', input: [{ type: 'text', text: 'Synthetic steering', text_elements: [] }] };
function fixture(fetcher: typeof fetch, authenticated = true) {
  vi.useFakeTimers();
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    location: { protocol: 'http:', host: 'localhost' }, setTimeout, clearTimeout, setInterval, clearInterval
  }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  vi.stubGlobal('fetch', fetcher);
  let remote!: ReturnType<typeof useRemote>;
  let queue: ReturnType<typeof QueuedMessages> = null;
  const bootstrap = { threads: { data: [thread], nextCursor: null }, models: { data: [] },
    projects: { data: [] } } as unknown as WorkspaceBootstrap;
  scope = new hooks.Scope();
  scope.root = () => {
    remote = useRemote({ authenticated, bootstrap });
    if (remote.activeThread) queue = QueuedMessages({ transport: remote.chatTransport, threadId: thread.id,
      readable: remote.authenticated, connected: remote.connected && remote.threadReady, activeTurnId: null,
      onError: console.error, onOpenSideChat: () => {}, queueEnabled: true, onQueueEnabledChange: () => {} });
  };
  scope.render();
  return { get remote() { return remote; }, get queue() { return queue; } };
}
const json = (body: unknown) => Promise.resolve({ ok: true, text: async () => JSON.stringify(body) } as Response);

describe('thread dock load ordering', () => {
  it('renders goal and steering before a stalled realtime connection or history read completes', async () => {
    const fetcher = vi.fn<typeof fetch>((path) => String(path).includes('/dock/goal') ? json({ goal })
      : String(path).includes('/dock/queue') ? json({ data: [queued] }) : new Promise(() => {}));
    const f = fixture(fetcher);
    void f.remote.openThread(thread.id).catch(() => {});
    await settle();
    expect(f.remote.activeThread?.id).toBe(thread.id);
    expect(f.remote.threadReady).toBe(false);
    expect(f.remote.activeGoal).toEqual(goal);
    expect(f.queue).not.toBeNull();
    const paths = fetcher.mock.calls.map(([path]) => String(path));
    expect(paths.some(path => path.includes('/goal'))).toBe(true);
    expect(paths.some(path => path.includes('/queue'))).toBe(true);
  });
  it('never starts private dock reads in an unverified returning shell', async () => {
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const f = fixture(fetcher, false);
    void f.remote.openThread(thread.id).catch(() => {});
    await settle();
    expect(fetcher.mock.calls.some(([path]) => String(path).includes('/dock/'))).toBe(false);
  });
  it('does not let an old goal read overwrite a newer native update', async () => {
    let resolveGoal!: (response: Response) => void;
    const f = fixture((path) => String(path).includes('/dock/goal')
      ? new Promise(resolve => { resolveGoal = resolve; }) : new Promise(() => {}));
    void f.remote.openThread(thread.id).catch(() => {}); await settle();
    const updated = { ...goal, status: 'paused', updatedAt: 20 };
    connection.options.onMessage({ type: 'event', method: 'thread/goal/updated', params: { threadId: thread.id, goal: updated } });
    scope.render();
    resolveGoal(await json({ goal })); await settle();
    expect(f.remote.activeGoal).toEqual(updated);
  });
  it('uses native goal actions with user provenance and immediately applies successful responses', async () => {
    const f = fixture((path) => String(path).includes('/dock/goal') ? json({ goal }) : new Promise(() => {}));
    void f.remote.openThread(thread.id).catch(() => {}); await settle();
    connection.options.onSocket({ readyState: 1, send: (payload: string) => {
      const message = JSON.parse(payload);
      if (message.type !== 'rpc') return;
      expect(message.params.origin).toBe('user');
      connection.options.onMessage({ type: 'rpc.result', id: message.id, result: message.method === 'thread/goal/clear'
        ? { cleared: true } : { goal: { ...goal, ...message.params } } });
    } });
    await f.remote.setGoal(thread.id, { status: 'paused' }); await settle();
    expect(f.remote.activeGoal?.status).toBe('paused');
    await f.remote.setGoal(thread.id, { objective: 'Edited objective', status: 'active' }); await settle();
    expect(f.remote.activeGoal?.objective).toBe('Edited objective');
    await f.remote.clearGoal(thread.id); await settle();
    expect(f.remote.activeGoal).toBeNull();
  });
  it('reuses a recent navigation window and invalidates it on a native change to that turn', async () => {
    const page = { items: [{ turnId: 't', item: { type: 'userMessage', id: 'u', content: [] } }],
      nextCursor: 'older', newerCursor: 'newer' };
    const fetcher = vi.fn<typeof fetch>((path) => String(path).includes('/around?') ? json(page) : new Promise(() => {}));
    const f = fixture(fetcher); void f.remote.openThread(thread.id).catch(() => {}); await settle();
    expect(await f.remote.revealHistory('t', 'u')).toBe(true); await settle();
    expect(await f.remote.revealHistory('t', 'u')).toBe(true); await settle();
    expect(fetcher.mock.calls.filter(([path]) => String(path).includes('/around?'))).toHaveLength(1);
    connection.options.onMessage({ type: 'event', method: 'thread/goal/updated', params: { threadId: thread.id, goal } });
    expect(await f.remote.revealHistory('t', 'u')).toBe(true); await settle();
    expect(fetcher.mock.calls.filter(([path]) => String(path).includes('/around?'))).toHaveLength(2);
  });
  it('does not cache a navigation response invalidated while the read is pending', async () => {
    const page = { items: [{ turnId: 't', item: { type: 'userMessage', id: 'u', content: [] } }],
      nextCursor: null, newerCursor: null };
    let resolvePage!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>((path) => String(path).includes('/around?')
      ? new Promise(resolve => { resolvePage = resolve; }) : new Promise(() => {}));
    const f = fixture(fetcher); void f.remote.openThread(thread.id).catch(() => {}); await settle();
    const first = f.remote.revealHistory('t', 'u'); await settle();
    connection.options.onMessage({ type: 'event', method: 'thread/goal/updated', params: { threadId: thread.id, goal } });
    resolvePage(await json(page)); expect(await first).toBe(true); await settle();
    const second = f.remote.revealHistory('t', 'u'); await settle();
    const reads = fetcher.mock.calls.filter(([path]) => String(path).includes('/around?')).length;
    resolvePage(await json(page)); await second;
    expect(reads).toBe(2);
  });

});
