interface ApiOptions extends RequestInit { timeoutMs?: number }

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { timeoutMs, signal, ...request } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const abort = () => controller?.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = timeoutMs ? setTimeout(() => controller!.abort(
    new DOMException('Connection timed out. Please retry.', 'TimeoutError')), timeoutMs) : undefined;
  try {
    const response = await fetch(path, {
      ...request,
      ...((controller?.signal ?? signal) ? { signal: controller?.signal ?? signal! } : {}),
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      },
      credentials: 'same-origin'
    });

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!response.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `Request failed (${response.status})`;
      throw new Error(message);
    }

    return body as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function isAbortedRequest(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class ReadRequests {
  private pending = new Map<string, { controller: AbortController; promise: Promise<unknown> }>();

  has(path: string): boolean {
    return this.pending.has(path);
  }

  get<T>(path: string): Promise<T> {
    const existing = this.pending.get(path);
    if (existing) return existing.promise as Promise<T>;
    const controller = new AbortController();
    const promise = api<T>(path, { cache: 'no-store', signal: controller.signal }).finally(() => {
      if (this.pending.get(path)?.controller === controller) this.pending.delete(path);
    });
    this.pending.set(path, { controller, promise });
    return promise;
  }

  cancel(): void {
    const previous = [...this.pending.values()];
    this.pending.clear();
    previous.forEach(({ controller }) => controller.abort());
  }
}
