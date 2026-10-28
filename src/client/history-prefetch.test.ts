import { describe, expect, it, vi } from 'vitest';
import { HistoryPrefetch, isReadableHistoryItem, prepareHistoryPage } from './history-prefetch';
import type { ThreadHistoryPage } from './types';
import type { TurnTiming } from '../shared/turn-timing';

const turn = (id: string): TurnTiming => ({ id, status: 'completed', startedAt: 1, completedAt: 2, durationMs: 1000 });
const page: ThreadHistoryPage = {
  items: [{ turnId: 'older', item: { type: 'agentMessage', id: 'answer', text: 'Answer' },
    startedAtMs: 1000, completedAtMs: 2000 }],
  nextCursor: 'before-older', activeTurnId: null, turns: [], turnsCursor: null
};

describe('silent history preparation', () => {
  it('continues past folded activity and commentary but stops for real conversation', () => {
    expect(isReadableHistoryItem({ type: 'reasoning', id: 'r', summary: ['Hidden'], content: [] })).toBe(false);
    expect(isReadableHistoryItem({ type: 'agentMessage', id: 'c', phase: 'commentary', text: 'Progress' })).toBe(false);
    expect(isReadableHistoryItem({ type: 'agentMessage', id: 'p', phase: 'partial_answer', text: 'Progress' })).toBe(false);
    expect(isReadableHistoryItem({ type: 'agentMessage', id: 'a', phase: 'final_answer', text: 'Answer' })).toBe(true);
    expect(isReadableHistoryItem({ type: 'agentMessage', id: 'legacy', text: 'Legacy reply' })).toBe(true);
  });

  it('recognizes image-only questions without counting blank messages as new context', () => {
    expect(isReadableHistoryItem({ type: 'userMessage', id: 'u', content: [{ type: 'text', text: '  ' }] })).toBe(false);
    expect(isReadableHistoryItem({ type: 'agentMessage', id: 'a', text: '  ' })).toBe(false);
    expect(isReadableHistoryItem({ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'Question' }] })).toBe(true);
    expect(isReadableHistoryItem({ type: 'userMessage', id: 'u', content: [{ type: 'localImage', path: '/question.png' }] })).toBe(true);
  });

  it('shares the pending and completed speculative page with the reader', async () => {
    const buffer = new HistoryPrefetch();
    let finish!: (value: ThreadHistoryPage) => void;
    const load = vi.fn(() => new Promise<ThreadHistoryPage>(resolve => { finish = resolve; }));
    const speculative = buffer.read('cursor', load);
    expect(buffer.read('cursor', load)).toBe(speculative);
    finish(page);
    await expect(speculative).resolves.toBe(page);
    await expect(buffer.read('cursor', load)).resolves.toBe(page);
    expect(load).toHaveBeenCalledTimes(1);
    buffer.clear();
    const next = vi.fn(async () => page);
    await buffer.read('next', next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('abandons a prior selection without retaining its result', async () => {
    const buffer = new HistoryPrefetch();
    let finish!: (value: ThreadHistoryPage) => void;
    const stale = buffer.read('previous-thread', () => new Promise(resolve => { finish = resolve; }));
    const rejected = expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    await buffer.read('next-thread', async () => page);
    finish(page);
    await rejected;
  });

  it('allows a foreground retry after speculative failure', async () => {
    const buffer = new HistoryPrefetch();
    await expect(buffer.read('cursor', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    await expect(buffer.read('cursor', async () => page)).resolves.toBe(page);
  });

  it('prepares all missing timing pages without advancing the visible cursors', async () => {
    const readTurns = vi.fn(async (cursor: string) => cursor === 'first'
      ? { data: [turn('middle')], nextCursor: 'second' }
      : { data: [turn('older')], nextCursor: 'third' });
    const known = { current: turn('current') };
    const prepared = await prepareHistoryPage(async () => page, readTurns, known, 'first', new AbortController().signal);
    expect(readTurns.mock.calls.map(([cursor]) => cursor)).toEqual(['first', 'second']);
    expect(prepared.turns.map(turn => turn.id)).toEqual(['middle', 'older']);
    expect(prepared.turnsCursor).toBe('third');
    expect(Object.keys(known)).toEqual(['current']);
    expect(page.turns).toEqual([]);
  });

  it('does not request timing already known or continue native reads after cancellation', async () => {
    const readTurns = vi.fn(async () => ({ data: [], nextCursor: null }));
    await prepareHistoryPage(async () => page, readTurns, { older: turn('older') }, 'cursor', new AbortController().signal);
    expect(readTurns).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(prepareHistoryPage(async () => page, readTurns, {}, 'cursor', controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(readTurns).not.toHaveBeenCalled();
  });
});
