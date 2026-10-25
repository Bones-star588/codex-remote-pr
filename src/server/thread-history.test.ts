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
  });

  it('preserves opaque cursors and avoids fetching turn metadata for older pages', async () => {
    const request = vi.fn(async () => ({ data: [], nextCursor: null }));
    await readThreadHistoryPage(request, 'thread', '{"ordinal":7000}', 200);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('thread/items/list', {
      threadId: 'thread', limit: 200, sortDirection: 'desc', cursor: '{"ordinal":7000}'
    });
  });
});
