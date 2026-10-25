import { describe, expect, it, vi } from 'vitest';
import { readThreadHistoryPage } from './thread-history.js';

describe('native history paging', () => {
  it('uses the owning server for fresh history and only reports an active turn', async () => {
    const request = vi.fn(async (method: string) => method === 'thread/items/list'
      ? { data: [{ turnId: 'new', item: { id: 'b' } }, { turnId: 'old', item: { id: 'a' } }], nextCursor: 'opaque:cursor' }
      : { data: [{ id: 'new', status: 'completed' }] });
    const page = await readThreadHistoryPage(request, 'thread', null, 2);
    expect(page.items.map((entry) => entry.item)).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(page.activeTurnId).toBeNull();
    expect(page.nextCursor).toBe('opaque:cursor');
    expect(request).toHaveBeenCalledWith('thread/items/list', { threadId: 'thread', limit: 2, sortDirection: 'desc' });
    expect(request).toHaveBeenCalledWith('thread/turns/list', { threadId: 'thread', limit: 2, itemsView: 'notLoaded' });
  });

  it('preserves opaque cursors and avoids fetching turn metadata for older pages', async () => {
    const request = vi.fn(async () => ({ data: [], nextCursor: null }));
    await readThreadHistoryPage(request, 'thread', '{"ordinal":7000}', 200);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('thread/items/list', {
      threadId: 'thread', limit: 200, sortDirection: 'desc', cursor: '{"ordinal":7000}'
    });
  });

  it('returns bounded native timing metadata and its cursor without hydrating entire turns', async () => {
    const turn = { id: 'active', status: 'inProgress', startedAt: 1792908818, completedAt: null, durationMs: null };
    const request = vi.fn(async (method: string) => method === 'thread/items/list'
      ? { data: [{ turnId: turn.id, item: { id: 'tool' } }], nextCursor: 'items:older' }
      : { data: [{ ...turn, items: [], unrelated: 'not forwarded' }], nextCursor: 'turns:older' });
    const page = await readThreadHistoryPage(request, 'thread', null, 40);
    expect(page).toMatchObject({ turns: [turn], turnsCursor: 'turns:older', activeTurnId: 'active' });
    expect(Object.keys(page.turns[0]!)).toEqual(['id', 'status', 'startedAt', 'completedAt', 'durationMs']);
  });
});
