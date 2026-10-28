import type { ClientRpcMethod } from '../shared/protocol.js';
import type { TurnTiming } from '../shared/turn-timing.js';

type Request = (method: ClientRpcMethod, params: unknown) => Promise<unknown>;

interface HistoryEntry {
  turnId: string;
  item: unknown;
  startedAtMs: number | null;
  completedAtMs: number | null;
}

export async function readOpenThread(
  request: Request,
  threadId: string,
  mode: 'resume' | 'read' | 'new'
) {
  const [result, history] = await Promise.all([
    request('thread/read', { threadId, includeTurns: false }),
    mode === 'new'
      ? Promise.resolve({ data: [], nextCursor: null })
      : request('thread/items/list', { threadId, limit: 40, sortDirection: 'desc' })
  ]) as [unknown, { data: HistoryEntry[]; nextCursor: string | null }];
  return {
    result,
    items: [...history.data].reverse(),
    nextCursor: history.nextCursor,
    activeTurnId: null,
    turns: [] as TurnTiming[],
    turnsCursor: null,
    timingsPending: mode !== 'new'
  };
}

export async function readThreadTimings(request: Request, threadId: string) {
  const result = await request('thread/turns/list', {
    threadId, limit: 40, itemsView: 'notLoaded'
  }) as { data: TurnTiming[]; nextCursor?: string | null };
  return {
    turns: result.data.map(({ id, status, startedAt, completedAt, durationMs }) =>
      ({ id, status, startedAt, completedAt, durationMs })),
    turnsCursor: result.nextCursor ?? null,
    activeTurnId: result.data.find(turn => turn.status === 'inProgress')?.id ?? null
  };
}
