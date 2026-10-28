import { describe, expect, it } from 'vitest';
import { applyTaskPage, provisionalHistory, provisionalThread } from './loading-snapshots';
import { reconcileThreadList } from './remote-state';
import type { Thread, ThreadHistoryPage } from './types';

describe('provisional display', () => {
  it('never restores a live status or model permission from a cached row', () => {
    const thread = { id: 'chat', status: { type: 'active' }, permissionProfile: 'full-access' } as Thread;
    expect(provisionalThread(thread)).toMatchObject({ id: 'chat', status: { type: 'notLoaded' }, permissionProfile: null });
    expect(thread.status.type).toBe('active');
  });

  it('keeps finished detail but withholds running controls and obsolete cursors', () => {
    const page: ThreadHistoryPage = {
      items: [
        { turnId: 'old', startedAtMs: null, completedAtMs: null,
          item: { type: 'commandExecution', id: 'done', command: 'test', cwd: '/', status: 'completed',
            aggregatedOutput: 'result', durationMs: 5, exitCode: 0 } },
        { turnId: 'active', startedAtMs: null, completedAtMs: null,
          item: { type: 'mcpToolCall', id: 'tool', server: 's', tool: 't', status: 'inProgress',
            arguments: {}, result: null, error: null } }
      ],
      turns: [
        { id: 'old', status: 'completed', startedAt: 1, completedAt: 2, durationMs: 1000 },
        { id: 'active', status: 'inProgress', startedAt: 3, completedAt: null, durationMs: null }
      ], activeTurnId: 'active', nextCursor: 'obsolete', turnsCursor: 'obsolete'
    };
    const display = provisionalHistory(page);
    expect(display.items).toHaveLength(1);
    expect(display.items[0]?.item).toMatchObject({ aggregatedOutput: 'result' });
    expect(display.turns).toHaveLength(1);
    expect(display.activeTurnId).toBeNull();
    expect(display.nextCursor).toBeNull();
    expect(display.turnsCursor).toBeNull();
    expect(page.nextCursor).toBe('obsolete');
  });

  it('replaces equal-timestamp provisional tasks and removes a cached deleted task', () => {
    const old = { id: 'same', updatedAt: 10, name: 'Old', status: { type: 'notLoaded' } } as Thread;
    const removed = { ...old, id: 'deleted' };
    const latest = { ...old, name: 'New', status: { type: 'idle' } } as Thread;
    const baseline = [old, removed];
    const projected = new Map(baseline.map(thread => [thread.id, thread]));
    const visible = applyTaskPage(baseline, [latest], projected);
    expect(visible[0]).toBe(latest);
    expect(reconcileThreadList(visible, [latest], baseline)).toEqual([latest]);
    const live = { ...old, name: 'Native live event' };
    expect(applyTaskPage([live], [latest], projected)).toEqual([live]);
  });
});
