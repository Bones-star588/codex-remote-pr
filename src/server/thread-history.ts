import type { ClientRpcMethod } from '../shared/protocol.js';
import type { TurnTiming } from '../shared/turn-timing.js';

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
    cursor ? null : request('thread/turns/list', { threadId, limit: Math.min(limit, 100), itemsView: 'notLoaded' })
  ]) as [{ data: Entry[]; nextCursor: string | null }, { data: TurnTiming[]; nextCursor?: string | null } | null];
  return {
    items: [...history.data].reverse(),
    nextCursor: history.nextCursor,
    activeTurnId: turns?.data.find((turn) => turn.status === 'inProgress')?.id ?? null,
    turns: turns?.data.map(({ id, status, startedAt, completedAt, durationMs }) =>
      ({ id, status, startedAt, completedAt, durationMs })) ?? [],
    turnsCursor: turns?.nextCursor ?? null
  };
}
