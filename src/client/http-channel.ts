export interface RemoteChannel extends EventTarget {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
}

// EventSource receives the same protocol as /ws; POSTs are sent once, in order.
export class HttpChannel extends EventTarget implements RemoteChannel {
  readyState = 0;
  private source: EventSource;
  private requests = new Set<AbortController>();
  private sending = Promise.resolve();
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
    const deliver = async () => {
      if (this.readyState !== 1) return;
      const controller = new AbortController();
      this.requests.add(controller);
      const timer = setTimeout(() => controller.abort(), data.length > 1024 * 1024 ? 120_000 : 12_000);
      try {
        const response = await fetch(this.url, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, body: data, signal: controller.signal
        });
        if (!response.ok) throw Object.assign(new Error('Remote HTTP connection failed.'), { status: response.status });
        await response.text();
      } finally {
        clearTimeout(timer);
        this.requests.delete(controller);
      }
    };
    // A large image upload must not hold the heartbeat behind its request body.
    if (JSON.parse(data).type === 'ping') void deliver().catch(error => this.fail(error));
    else this.sending = this.sending.then(deliver).catch(error => this.fail(error));
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.source.close();
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    this.dispatchEvent(new Event('close'));
  }

  private fail(error?: unknown): void {
    if (this.readyState === 3) return;
    this.dispatchEvent(Object.assign(new Event('error'), { error }));
    this.close();
  }
}
