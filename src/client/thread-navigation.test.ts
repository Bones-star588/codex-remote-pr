import { describe, expect, it } from 'vitest';
import { loadedOutline, mergeOutlineTurns } from './thread-navigation';
import type { OutlineTurn } from '../shared/thread-outline';

const turn = (id: string, startedAt: number): OutlineTurn => ({
  id, startedAt, status: 'completed', completedAt: startedAt + 10, durationMs: 10000,
  messages: [{ itemId: `${id}-user`, prompt: id, reply: 'Answer' }]
});

describe('conversation outline', () => {
  it('merges native summary pages in chronological order without losing loaded steering messages', () => {
    const latest = turn('latest', 200);
    latest.messages.push({ itemId: 'steer', prompt: 'Follow up', reply: '' });
    const merged = mergeOutlineTurns([latest], [turn('old', 100), turn('latest', 200)]);
    expect(merged.map(entry => entry.id)).toEqual(['old', 'latest']);
    expect(merged[1]!.messages.map(message => message.itemId)).toEqual(['latest-user', 'steer']);
    expect(mergeOutlineTurns(merged, [turn('latest', 200)])).toBe(merged);
  });

  it('keeps each loaded user message distinct and ignores internal items', () => {
    const entries = loadedOutline([
      { type: 'userMessage', id: 'one', turnId: 't', content: [{ type: 'text', text: 'One' }] },
      { type: 'reasoning', id: 'private', turnId: 't', summary: ['hidden'], content: [] },
      { type: 'userMessage', id: 'two', turnId: 't', content: [{ type: 'localImage', path: '/private/image.png' }] },
      { type: 'agentMessage', id: 'final', turnId: 't', phase: 'final_answer', text: 'Done' }
    ], { t: turn('t', 100) });
    expect(entries[0]!.messages).toEqual([
      { itemId: 'one', prompt: 'One', reply: '' },
      { itemId: 'two', prompt: '图片', reply: 'Done' }
    ]);
    expect(entries[0]!.durationMs).toBe(10000);
  });

  it('retains known turn ordering when a bounded window has no timing metadata yet', () => {
    const current = [turn('old', 100), turn('new', 200)];
    const partial = { ...turn('old', 100), startedAt: null, status: 'inProgress' as const };
    const merged = mergeOutlineTurns(current, [partial]);
    expect(merged.map(turn => turn.id)).toEqual(['old', 'new']);
    expect(merged[0]!.startedAt).toBe(100);
    expect(merged[0]!.status).toBe('completed');
  });

  it('places the native opening request before follow-ups loaded from a later history page', () => {
    const native = turn('t', 100);
    const partial = { ...native, messages: [{ itemId: 'follow-up', prompt: 'Follow up', reply: '' }] };
    const merged = mergeOutlineTurns([partial], [native], true);
    expect(merged[0]!.messages.map(message => message.itemId)).toEqual(['t-user', 'follow-up']);
  });
});
