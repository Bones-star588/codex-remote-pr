import { describe, expect, it } from 'vitest';

import { displayThreadTitle, findActiveTurnId, mergeLatestHistoryItems, mergeOlderHistoryItems, reconcileThreadList, upsertItem } from './remote-state';
import type { Thread, ThreadItem } from './types';

describe('remote thread state', () => {
  it('keeps live additions, renames and removals while paginated reconciliation finishes', () => {
    const task = (id: string, name = id) => ({ id, name, updatedAt: 10 } as Thread);
    const unchanged = task('unchanged');
    const renamed = task('renamed');
    const removed = task('removed');
    const live = task('new');
    const changed = { ...renamed, name: 'Live title' };
    const result = reconcileThreadList([unchanged, changed, live],
      [task('unchanged'), task('renamed'), task('removed'), task('older')],
      [unchanged, renamed, removed]);
    expect(result.map(thread => thread.id).sort()).toEqual(['new', 'older', 'renamed', 'unchanged']);
    expect(result.find(thread => thread.id === 'renamed')).toBe(changed);
  });
  it('replaces unchanged paginated rows and keeps a newly loaded row archived during pagination', () => {
    const old = { id: 'existing', name: 'Old', updatedAt: 1 } as Thread;
    const loaded = { id: 'page-two', name: 'Page two', updatedAt: 2 } as Thread;
    const latest = { ...old, name: 'Snapshot title', updatedAt: 3 };
    const baseline = [old, loaded];
    expect(reconcileThreadList([old], [latest, { ...loaded }], baseline)).toEqual([latest]);
  });
  it('preserves live updates received after a history request began and inserts missing items in order', () => {
    const message = (id: string, text = id): ThreadItem => ({ type: 'agentMessage', id, text });
    const baseline = [message('old'), message('shared', 'partial')];
    const streamed = { ...baseline[1]!, text: 'partial and live' } as ThreadItem;
    expect(mergeLatestHistoryItems(
      [baseline[0]!, streamed, message('live')],
      [message('missing'), message('shared', 'partial')],
      baseline
    )).toEqual([baseline[0], message('missing'), streamed, message('live')]);
  });
  it('keeps reused item ids in separate turns and retains unchanged objects', () => {
    const first: ThreadItem = { type: 'agentMessage', id: '0', turnId: 'one', text: 'First' };
    const second: ThreadItem = { type: 'agentMessage', id: '0', turnId: 'two', text: 'Second' };
    expect(upsertItem([first], second)).toEqual([first, second]);
    expect(mergeOlderHistoryItems([first], [second])).toEqual([first, second]);
    const items = [first, second];
    expect(mergeLatestHistoryItems(items, [{ ...second }])).toBe(items);
    expect(mergeLatestHistoryItems(items, [{ ...second, text: 'Updated' }])).toEqual([first, { ...second, text: 'Updated' }]);
  });
  it('restores the latest in-progress turn', () => {
    expect(
      findActiveTurnId([
        { id: 'done', status: 'completed', items: [], startedAt: null, completedAt: null, durationMs: null },
        { id: 'active', status: 'inProgress', items: [], startedAt: null, completedAt: null, durationMs: null }
      ])
    ).toBe('active');
  });

  it('appends streamed agent text without replacing existing content', () => {
    const items: ThreadItem[] = [{ type: 'agentMessage', id: 'agent-1', text: 'hello' }];
    expect(
      upsertItem(items, { type: 'agentMessage', id: 'agent-1', text: ' world' }, true)
    ).toEqual([{ type: 'agentMessage', id: 'agent-1', text: 'hello world' }]);
  });

  it('preserves native start anchors across deltas and completion notifications', () => {
    const started: ThreadItem = { type: 'agentMessage', id: 'answer', text: '', phase: 'final_answer', startedAtMs: 147_250 };
    const streamed = upsertItem([started], { type: 'agentMessage', id: 'answer', text: 'Answer' }, true);
    expect(streamed[0]).toMatchObject({ startedAtMs: 147_250, phase: 'final_answer' });
    const completed = upsertItem(streamed, { type: 'agentMessage', id: 'answer', text: 'Answer',
      phase: 'final_answer', completedAtMs: 200_000 });
    expect(completed[0]).toMatchObject({ startedAtMs: 147_250, completedAtMs: 200_000 });
  });

  it('uses a stable fallback title', () => {
    const thread: Thread = {
      id: 'thread-1',
      name: null,
      preview: '',
      cwd: 'C:\\workspace',
      projectId: null,
      model: null,
      modelProvider: 'openai',
      reasoningEffort: null,
      createdAt: 0,
      updatedAt: 0,
      status: { type: 'idle' }
    };
    expect(displayThreadTitle(thread)).toBe('未命名任务');
  });
});
