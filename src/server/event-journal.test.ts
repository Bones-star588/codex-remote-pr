import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventJournal } from './event-journal.js';

afterEach(() => vi.useRealTimers());

describe('bounded connection replay', () => {
  const event = (threadId: string, delta = 'next') => ({
    type: 'event' as const, method: 'item/agentMessage/delta', params: { threadId, delta }
  });

  it('replays ordered missing events only for subscribed threads and includes global events', () => {
    const journal = new EventJournal();
    journal.append(event('main', 'already received'));
    journal.append(event('other'));
    journal.append(event('side'));
    journal.append({ type: 'bridge.status', status: 'ready' });
    const replay = journal.resume(journal.epoch, 1, new Set(['main', 'side']));
    expect(replay.resumed).toBe(true);
    expect(replay.entries.map(entry => entry.sequence)).toEqual([3, 4]);
    expect(replay.sequence).toBe(4);
  });

  it('falls back to snapshots on expiry, byte overflow, server restart or an invalid cursor', () => {
    vi.useFakeTimers();
    const journal = new EventJournal(500, 1000);
    journal.append(event('main'));
    expect(journal.resume(journal.epoch, 0, new Set(['main'])).resumed).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(journal.resume(journal.epoch, 0, new Set(['main'])).resumed).toBe(false);
    expect(journal.resume(journal.epoch, 1, new Set(['main'])).resumed).toBe(true);
    journal.append(event('main', 'x'.repeat(600)));
    expect(journal.resume(journal.epoch, 1, new Set(['main'])).resumed).toBe(false);
    const epoch = journal.epoch;
    journal.reset();
    expect(journal.resume(epoch, 2, new Set()).resumed).toBe(false);
    expect(journal.resume(journal.epoch, 100, new Set()).resumed).toBe(false);
  });
});
