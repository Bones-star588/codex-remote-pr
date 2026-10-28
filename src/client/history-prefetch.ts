import type { TurnTiming } from '../shared/turn-timing';
import type { ThreadHistoryPage } from './types';
export { isReadableHistoryItem } from '../shared/history-context';

/** One speculative page, shared with the foreground reader and never persisted. */
export class HistoryPrefetch {
  private entry: { key: string; controller: AbortController; promise: Promise<ThreadHistoryPage> } | null = null;

  read(key: string, load: (signal: AbortSignal) => Promise<ThreadHistoryPage>): Promise<ThreadHistoryPage> {
    if (this.entry?.key === key) return this.entry.promise;
    this.clear();
    const controller = new AbortController();
    const promise = load(controller.signal).then(page => {
      controller.signal.throwIfAborted();
      return page;
    }).catch(error => {
      if (this.entry?.controller === controller) this.entry = null;
      throw error;
    });
    this.entry = { key, controller, promise };
    return promise;
  }

  clear(): void {
    this.entry?.controller.abort();
    this.entry = null;
  }
}

export async function prepareHistoryPage(
  readPage: () => Promise<ThreadHistoryPage>,
  readTurns: (cursor: string) => Promise<{ data: TurnTiming[]; nextCursor: string | null }>,
  knownTurns: Record<string, TurnTiming>,
  turnsCursor: string | null,
  signal: AbortSignal
): Promise<ThreadHistoryPage> {
  const page = await readPage();
  signal.throwIfAborted();
  const turns = [...page.turns];
  const known = new Set([...Object.keys(knownTurns), ...turns.map(turn => turn.id)]);
  const missing = new Set(page.items.map(entry => entry.turnId).filter(id => !known.has(id)));
  while (missing.size && turnsCursor !== null) {
    const result = await readTurns(turnsCursor);
    signal.throwIfAborted();
    turns.push(...result.data);
    result.data.forEach(turn => missing.delete(turn.id));
    const previous = turnsCursor;
    turnsCursor = result.nextCursor;
    if (turnsCursor === previous) break;
  }
  return { ...page, turns, turnsCursor };
}
