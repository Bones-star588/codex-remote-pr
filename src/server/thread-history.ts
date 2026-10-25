import type { ClientRpcMethod } from '../shared/protocol.js';
import type { TurnTiming } from '../shared/turn-timing.js';
import { outlineMessages, type OutlineItem, type OutlineTurn } from '../shared/thread-outline.js';

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
  limit = 200,
  direction: 'asc' | 'desc' = 'desc'
) {
  const [history, turns] = await Promise.all([
    request('thread/items/list', { threadId, limit, sortDirection: direction, ...(cursor ? { cursor } : {}) }),
    cursor ? null : request('thread/turns/list', { threadId, limit: Math.min(limit, 100), itemsView: 'notLoaded' })
  ]) as [{ data: Entry[]; nextCursor: string | null }, { data: TurnTiming[]; nextCursor?: string | null } | null];
  return {
    items: direction === 'desc' ? [...history.data].reverse() : history.data,
    nextCursor: history.nextCursor,
    activeTurnId: turns?.data.find((turn) => turn.status === 'inProgress')?.id ?? null,
    turns: turns?.data.map(({ id, status, startedAt, completedAt, durationMs }) =>
      ({ id, status, startedAt, completedAt, durationMs })) ?? [],
    turnsCursor: turns?.nextCursor ?? null
  };
}

export async function readThreadOutline(request: Request, threadId: string, cursor: string | null) {
  const result = await request('thread/turns/list', {
    threadId, limit: 100, itemsView: 'summary', ...(cursor ? { cursor } : {})
  }) as { data: Array<TurnTiming & { items: OutlineItem[] }>; nextCursor: string | null };
  const turns: OutlineTurn[] = [...result.data].reverse().map(({ id, status, startedAt, completedAt, durationMs, items }) =>
    ({ id, status, startedAt, completedAt, durationMs, messages: outlineMessages(items) }));
  return { turns, nextCursor: result.nextCursor };
}

export async function readThreadHistoryAround(request: Request, threadId: string, turnId: string, itemId: string) {
  const list = (params: Record<string, unknown>) => request('thread/items/list', { threadId, ...params }) as
    Promise<{ data: Entry[]; nextCursor: string | null; backwardsCursor?: string | null }>;
  let seed = await list({ turnId, sortDirection: 'asc', limit: 1 });
  const first = seed.data[0]?.item as { id: string } | undefined;
  if (!first) throw new Error('This turn is no longer available.');
  if (first.id !== itemId) {
    // The native item anchor is exclusive. Its predecessor supplies a reusable
    // opaque cursor for paging across turn boundaries without scanning history.
    const preceding = await list({ turnId, cursor: { type: 'item', itemId }, sortDirection: 'desc', limit: 1 });
    const predecessor = preceding.data[0]?.item as { id: string } | undefined;
    seed = { ...preceding, nextCursor: preceding.nextCursor ?? (predecessor?.id === first.id ? seed.nextCursor : null) };
  }
  const cursor = seed.nextCursor ?? seed.backwardsCursor;
  if (!cursor) {
    return { items: seed.data, nextCursor: null, newerCursor: null };
  }
  const [older, newer] = await Promise.all([
    list({ cursor, sortDirection: 'desc', limit: 40 }),
    list({ cursor, sortDirection: 'asc', limit: 40 })
  ]);
  const unique = new Map([...older.data].reverse().concat(seed.data, newer.data)
    .map(entry => [JSON.stringify([entry.turnId, (entry.item as { id: string }).id]), entry]));
  return {
    items: [...unique.values()],
    nextCursor: older.nextCursor,
    newerCursor: newer.nextCursor
  };
}
