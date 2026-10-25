import { describe, expect, it, vi } from 'vitest';
import { readWorkspaceBootstrap } from './bootstrap.js';

describe('initial workspace request', () => {
  it('fetches the first all-provider page and metadata together without loading chat history', async () => {
    const request = vi.fn(async (method: string) => ({
      data: [{ id: method }], nextCursor: method === 'thread/list' ? 'next-page' : null
    }));
    const result = await readWorkspaceBootstrap(request);
    expect(request.mock.calls.map(([method]) => method)).toEqual(['thread/list', 'model/list', 'project/list']);
    expect(request).toHaveBeenCalledWith('thread/list', {
      limit: 200, sortKey: 'updated_at', sortDirection: 'desc',
      useStateDbOnly: true, modelProviders: [], archived: false
    });
    expect(result.threads).toEqual({ data: [{ id: 'thread/list' }], nextCursor: 'next-page' });
  });

  it('preserves available lists when a native metadata request fails', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'model/list') throw new Error('Catalog unavailable');
      return { data: [], nextCursor: null };
    });
    const result = await readWorkspaceBootstrap(request);
    expect(result.models).toBeNull();
    expect(result.threads).toEqual({ data: [], nextCursor: null });
    expect(result.projects).toEqual({ data: [], nextCursor: null });
  });

  it('does not block the workspace indefinitely when the native catalog is unavailable', async () => {
    vi.useFakeTimers();
    try {
      const result = readWorkspaceBootstrap(async (method) =>
        method === 'model/list' ? new Promise(() => {}) : { data: [], nextCursor: null });
      await vi.advanceTimersByTimeAsync(1500);
      expect((await result).models).toBeNull();
      expect((await result).threads).toEqual({ data: [], nextCursor: null });
    } finally {
      vi.useRealTimers();
    }
  });
});
