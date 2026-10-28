import { describe, expect, it, vi } from 'vitest';
import { readOpenThread } from './thread-open.js';

describe('opening a read-only chat without waiting for interaction setup', () => {
  it('reads a small latest page without resuming or waiting for turn metadata', async () => {
    const request = vi.fn(async (method: string) => method === 'thread/read'
      ? { thread: { id: 'chat' } }
      : { data: [], nextCursor: method === 'thread/items/list' ? 'older' : null });
    const page = await readOpenThread(request, 'chat', 'resume');
    expect(page.result).toEqual({ thread: { id: 'chat' } });
    expect(page.nextCursor).toBe('older');
    expect(request).toHaveBeenCalledWith('thread/read', { threadId: 'chat', includeTurns: false });
    expect(request).toHaveBeenCalledWith('thread/items/list', { threadId: 'chat', limit: 40, sortDirection: 'desc' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(page.timingsPending).toBe(true);
  });

  it('does not resume or load history for an unsent new chat', async () => {
    const request = vi.fn(async () => ({ thread: { id: 'unsent' } }));
    const page = await readOpenThread(request, 'unsent', 'new');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('thread/read', { threadId: 'unsent', includeTurns: false });
    expect(page.items).toEqual([]);
  });

  it('reads archived chats without resuming them', async () => {
    const request = vi.fn(async (method: string) => method === 'thread/read'
      ? { thread: { id: 'chat' } } : { data: [], nextCursor: null });
    await readOpenThread(request, 'chat', 'read');
    expect(request).toHaveBeenCalledWith('thread/read', { threadId: 'chat', includeTurns: false });
    expect(request.mock.calls.some(([method]) => method === 'thread/resume')).toBe(false);
  });
});
