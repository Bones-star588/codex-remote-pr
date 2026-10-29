import type { ClientMessage, ClientRpcMethod, ServerMessage } from '../shared/protocol';

export interface RemoteChannel extends EventTarget {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
}

const independentReads = new Set<ClientRpcMethod>([
  'thread/list', 'thread/read', 'thread/resume', 'thread/goal/get', 'thread/turns/list', 'thread/items/list', 'thread/queue/list',
  'model/list', 'permissionProfile/list', 'project/list', 'project/read', 'getAuthStatus',
  'account/read', 'account/rateLimits/read', 'config/read', 'mcpServerStatus/list', 'skills/list',
  'collaborationMode/list', 'fs/readFile', 'fs/readDirectory', 'fs/getMetadata',
  'gitDiffToRemote', 'getConversationSummary'
]);

// Preserve action order without making reads or connection control wait for action receipts.
export class HttpChannel extends EventTarget implements RemoteChannel {
  readyState = 0;
  private source: EventSource;
  private requests = new Set<AbortController>();
  private sending = Promise.resolve();
  private controls = Promise.resolve();
  private delays = new Map<ReturnType<typeof setTimeout>, () => void>();
  private watchVersion = 0;
  private readonly url: string;

  constructor(base: string) {
    super();
    this.url = `${base}?id=${crypto.randomUUID()}`;
    this.source = new EventSource(this.url);
    this.source.addEventListener('open', () => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    });
    this.source.addEventListener('message', event => {
      if (this.readyState === 1) this.dispatchEvent(new MessageEvent('message', { data: event.data }));
    });
    this.source.addEventListener('error', () => this.fail());
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('Remote HTTP connection is not ready.');
    const message = JSON.parse(data) as ClientMessage;
    const control = message.type === 'ping' || message.type === 'sync.resume' || message.type === 'thread.watch';
    const watchVersion = message.type === 'thread.watch' ? ++this.watchVersion : undefined;
    const deliver = async (): Promise<void> => {
      for (let attempt = 0; attempt < (control ? 3 : 1); attempt++) {
        if (this.readyState !== 1 || watchVersion !== undefined && watchVersion !== this.watchVersion) return;
        try { await this.post(data); return; }
        catch (error) {
          if (this.readyState !== 1) return;
          const status = (error as { status?: number })?.status;
          if (status === 401 || status === 409) { this.fail(error); return; }
          if (watchVersion !== undefined && watchVersion !== this.watchVersion) return;
          if (control && attempt < 2 && (status === undefined || status === 429 || status >= 500)) {
            await this.delay(attempt === 0 ? 500 : 1000);
            continue;
          }
          const description = 'Remote request confirmation failed; this operation was not retried.';
          this.message(message.type === 'rpc'
            ? { type: 'rpc.error', id: message.id, error: { message: description } }
            : message.type === 'server.request.respond'
              ? { type: 'server.request.failed', requestId: message.requestId, error: { message: description } }
              : { type: 'error', error: { message: 'Remote connection control could not be confirmed. Please retry.' } });
          return;
        }
      }
    };
    if (message.type === 'ping' || message.type === 'rpc' && independentReads.has(message.method)) void deliver();
    else if (control) this.controls = this.controls.then(deliver);
    else this.sending = this.sending.then(deliver);
  }

  private async post(data: string): Promise<void> {
    const controller = new AbortController();
    this.requests.add(controller);
    const timer = setTimeout(() => controller.abort(), data.length > 1024 * 1024 ? 120_000 : 12_000);
    try {
      const response = await fetch(this.url, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: data, signal: controller.signal
      });
      if (!response.ok) throw Object.assign(new Error('Remote HTTP request failed.'), { status: response.status });
      await response.text();
    } finally {
      clearTimeout(timer);
      this.requests.delete(controller);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.delays.delete(timer); resolve(); }, ms);
      this.delays.set(timer, resolve);
    });
  }

  private message(message: ServerMessage): void {
    if (this.readyState === 1) this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.source.close();
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    for (const [timer, resolve] of this.delays) { clearTimeout(timer); resolve(); }
    this.delays.clear();
    this.dispatchEvent(new Event('close'));
  }

  private fail(error?: unknown): void {
    if (this.readyState === 3) return;
    this.dispatchEvent(Object.assign(new Event('error'), { error }));
    this.close();
  }
}
