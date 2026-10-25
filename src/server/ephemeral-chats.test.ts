import { afterEach, describe, expect, it, vi } from 'vitest';
import { EphemeralChats } from './ephemeral-chats.js';

afterEach(() => vi.useRealTimers());
describe('temporary chat ownership', () => {
  it('keeps reconnected chats but releases abandoned tabs after the disconnect grace', async () => {
    vi.useFakeTimers();
    const release = vi.fn().mockResolvedValue({});
    const chats = new EphemeralChats<string>(release, 100);
    chats.add('side', 'old');
    chats.disconnect('old');
    chats.claim(['side'], 'new');
    await vi.advanceTimersByTimeAsync(101);
    expect(release).not.toHaveBeenCalled();
    chats.disconnect('new');
    await vi.advanceTimersByTimeAsync(101);
    expect(release).toHaveBeenCalledExactlyOnceWith('side');
  });

  it('restores streamed temporary history without native persisted-history APIs', () => {
    const chats = new EphemeralChats<string>(async () => {});
    chats.add('side', 'socket');
    chats.record('item/agentMessage/delta', { threadId: 'side', turnId: 't', itemId: 'a', delta: 'A' });
    chats.record('item/agentMessage/delta', { threadId: 'main', turnId: 't', itemId: 'a', delta: 'wrong' });
    chats.record('item/completed', { threadId: 'side', turnId: 't', item: { id: 'a', type: 'agentMessage', text: 'AB' } });
    chats.record('turn/completed', { threadId: 'side', turn: { id: 't', status: 'completed' } });
    expect(chats.snapshot('side')).toMatchObject({ items: [{ id: 'a', turnId: 't', text: 'AB' }], activeTurnId: null });
    chats.remove('side');
    expect(chats.snapshot('side')).toBeNull();
  });

  it('recovers submitted input and replies when Desktop sends only turn-level items', () => {
    const chats = new EphemeralChats<string>(async () => {});
    chats.add('side', 'socket');
    chats.recordInput('side', 't', 'user', [{ type: 'text', text: 'Question' }]);
    chats.record('turn/completed', { threadId: 'side', turn: { id: 't', status: 'completed',
      items: [{ id: 'a', type: 'agentMessage', text: 'OK' }] } });
    expect(chats.snapshot('side')?.items).toMatchObject([
      { type: 'userMessage', turnId: 't', content: [{ text: 'Question' }] },
      { type: 'agentMessage', turnId: 't', text: 'OK' }
    ]);
  });
});
