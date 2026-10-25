import type { ClientRpcMethod } from '../shared/protocol.js';

type Request = (method: ClientRpcMethod, params: unknown) => Promise<unknown>;
interface Entry {
  turnId: string;
  item: unknown;
  startedAtMs: number | null;
  completedAtMs: number | null;
}

export async function readThreadHistoryPage(
  request: Request,
  threadId: string,
  cursor: string | null,
  limit = 200
) {
  const [history, turns] = await Promise.all([
    request('thread/items/list', { threadId, limit, sortDirection: 'desc', ...(cursor ? { cursor } : {}) }),
    cursor ? null : request('thread/turns/list', { threadId, limit: 1, itemsView: 'notLoaded' })
  ]) as [{ data: Entry[]; nextCursor: string | null }, { data: Array<{ id: string; status: string }> } | null];
  return {
    items: [...history.data].reverse(),
    nextCursor: history.nextCursor,
    activeTurnId: turns?.data.find((turn) => turn.status === 'inProgress')?.id ?? null
  };
}
