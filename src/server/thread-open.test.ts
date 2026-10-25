import { describe, expect, it, vi } from 'vitest';
import { readOpenThread } from './thread-open.js';

describe('opening a chat over one HTTP request', () => {
  it('resumes and reads a small latest page on the owning native server', async () => {
    const request = vi.fn(async (method: string) => method === 'thread/resume'
      ? { thread: { id: 'chat' } }
      : { data: [], nextCursor: method === 'thread/items/list' ? 'older' : null });
    const page = await readOpenThread(request, 'chat', 'resume');
    expect(page.result).toEqual({ thread: { id: 'chat' } });
    expect(page.nextCursor).toBe('older');
    expect(request).toHaveBeenCalledWith('thread/resume', { threadId: 'chat', excludeTurns: true });
    expect(request).toHaveBeenCalledWith('thread/items/list', { threadId: 'chat', limit: 40, sortDirection: 'desc' });
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
