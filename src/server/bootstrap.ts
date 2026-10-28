import type { ClientRpcMethod } from '../shared/protocol.js';

type Request = (method: ClientRpcMethod, params: unknown) => Promise<unknown>;

export function readThreadListPage(request: Request, cursor: string | null = null, archived = false) {
  return request('thread/list', {
    limit: 200, sortKey: 'updated_at', sortDirection: 'desc',
    useStateDbOnly: true, modelProviders: [], archived,
    ...(cursor ? { cursor } : {})
  });
}

export class MetadataReader {
  private entries = new Map<string, { promise: Promise<unknown>; completedAt: number | null }>();

  constructor(private request: Request) {}

  read: Request = (method, params) => {
    if (method !== 'model/list' && method !== 'project/list') return this.request(method, params);
    const key = `${method}:${JSON.stringify(params)}`;
    const previous = this.entries.get(key);
    if (previous && (previous.completedAt === null || Date.now() - previous.completedAt < 5000)) {
      return previous.promise;
    }
    const entry = { promise: this.request(method, params), completedAt: null as number | null };
    this.entries.set(key, entry);
    // Bridge the bootstrap-to-WebSocket gap, including responses that finish
    // while the browser is still receiving the first task page.
    void entry.promise.then(
      () => { entry.completedAt = Date.now(); },
      () => { if (this.entries.get(key) === entry) this.entries.delete(key); }
    );
    return entry.promise;
  };

  clear(method?: 'model/list' | 'project/list'): void {
    if (!method) this.entries.clear();
    else for (const key of this.entries.keys()) {
      if (key.startsWith(`${method}:`)) this.entries.delete(key);
    }
  }
}

export async function readWorkspaceBootstrap(
  request: Request
) {
  const read = async (method: ClientRpcMethod, params: unknown) => {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        request(method, params),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Initial metadata is not ready.')), 1500);
        })
      ]);
    } finally {
      clearTimeout(timer!);
    }
  };
  const threads = readThreadListPage(read).catch(() => null);
  let models: unknown = null;
  let projects: unknown = null;
  void read('model/list', { limit: 100, includeHidden: false }).then(value => { models = value; }, () => {});
  void read('project/list', { limit: 200 }).then(value => { projects = value; }, () => {});
  return {
    threads: await threads,
    models,
    projects
  };
}
