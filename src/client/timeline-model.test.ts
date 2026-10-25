import { describe, expect, it } from 'vitest';

import { buildTimelineEntries, buildTimelineSections, isActivityIssue } from './timeline-model';
import type { ThreadItem } from './types';

function command(id: string, status: 'inProgress' | 'completed' | 'failed' | 'declined' = 'completed'): ThreadItem {
  return {
    type: 'commandExecution',
    id,
    command: 'echo test',
    cwd: 'F:\\Example',
    status,
    aggregatedOutput: null,
    exitCode: status === 'failed' ? 1 : status === 'completed' ? 0 : null,
    durationMs: null
  };
}

function agent(id: string): Extract<ThreadItem, { type: 'agentMessage' }> {
  return { type: 'agentMessage', id, text: 'Done' };
}

describe('timeline model', () => {
  it('merges consecutive commands into a native foldable row', () => {
    const entries = buildTimelineEntries([
      command('one'),
      command('two', 'failed')
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'activity',
      kind: 'command',
      failedCount: 1,
      running: false
    });
    expect(entries[0]?.type === 'activity' ? entries[0].items : []).toHaveLength(2);
  });

  it('keeps messages between separate activity runs', () => {
    const entries = buildTimelineEntries([
      command('one'),
      agent('answer-one'),
      command('two', 'inProgress'),
      agent('answer-two')
    ]);

    expect(entries.map((entry) => entry.type)).toEqual([
      'activity',
      'message',
      'activity',
      'message'
    ]);
    expect(entries[2]).toMatchObject({ type: 'activity', running: false });
  });

  it('preserves commentary between native operation summaries and the final answer', () => {
    const entries = buildTimelineEntries([
      { type: 'userMessage', id: 'user', content: [], turnId: 't', startedAtMs: 1000 },
      { ...agent('intro'), turnId: 't', phase: 'commentary' },
      { ...command('one'), turnId: 't' },
      { ...agent('progress'), turnId: 't', phase: 'commentary' },
      { ...command('two'), turnId: 't' },
      { ...agent('final'), turnId: 't', phase: 'final_answer', startedAtMs: 1000, completedAtMs: 9000 }
    ]);
    expect(entries.map((entry) => entry.type)).toEqual(['message', 'message', 'activity', 'message', 'activity', 'message']);
    expect(entries[3]).toMatchObject({ type: 'message', item: { id: 'progress' } });
    expect(entries[5]).toMatchObject({ type: 'message', item: { id: 'final' } });
  });

  it('keeps an activity group mounted when more output arrives', () => {
    const first = command('one');
    const initial = buildTimelineEntries([first]);
    const updated = buildTimelineEntries([first, command('two'), agent('final')]);
    expect(initial[0]?.key).toBe(updated[0]?.key);
  });

  it('counts declined operations separately from tool failures', () => {
    const items = [command('failure', 'failed'), command('refused', 'declined'), command('ok')];
    const entries = buildTimelineEntries(items);
    expect(entries[0]).toMatchObject({ failedCount: 1, declinedCount: 1 });
    expect(items.filter(isActivityIssue).map((item) => item.id)).toEqual(['failure', 'refused']);
  });

  it('does not keep completed or interrupted turns spinning because of stale item status', () => {
    const items = [{ ...command('stale', 'inProgress'), turnId: 'old' }];
    expect(buildTimelineEntries(items, null)[0]).toMatchObject({ running: false });
    expect(buildTimelineEntries(items, 'new')[0]).toMatchObject({ running: false });
  });

  it('hides reasoning without retaining a stale spinner from another turn', () => {
    const entries = buildTimelineEntries([
      { ...command('stale', 'inProgress'), turnId: 'old' },
      { type: 'reasoning', id: 'thinking', summary: ['Thinking'], content: [], turnId: 'current' }
    ], 'current');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ running: false });
  });

  it('stops the activity indicator when the active turn starts its final reply', () => {
    const entries = buildTimelineEntries([
      { ...command('tool', 'inProgress'), turnId: 'current' },
      { ...agent('final'), turnId: 'current', phase: 'final_answer' }
    ], 'current');
    expect(entries[0]).toMatchObject({ type: 'activity', running: false });
    expect(entries[1]).toMatchObject({ type: 'message' });
  });

  it('combines native commands, edits and search, hides reasoning, and keeps image/compaction boundaries', () => {
    const entries = buildTimelineEntries([
      command('one'),
      { type: 'fileChange', id: 'edit', status: 'completed', changes: [{ path: 'src/app.ts' }] },
      { type: 'reasoning', id: 'think', summary: ['Thinking'], content: [] },
      { type: 'webSearch', id: 'search', query: 'Native app server' },
      { type: 'imageView', id: 'image', path: 'C:/Projects/example.png' },
      { type: 'contextCompaction', id: 'compact' }
    ]);
    expect(entries.map((entry) => entry.type === 'activity' ? entry.kind : entry.type))
      .toEqual(['file', 'image', 'event']);
    expect(entries[0]).toMatchObject({ kinds: ['command', 'file', 'search'], items: [{ id: 'one' }, { id: 'edit' }, { id: 'search' }] });
  });

  it('does not show empty native reasoning records or let them split consecutive commands', () => {
    const entries = buildTimelineEntries([
      command('one'),
      { type: 'reasoning', id: 'empty', summary: [], content: ['  '] },
      command('two'),
      { type: 'reasoning', id: 'visible', summary: ['Inspecting files'], content: [] }
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'activity', kind: 'command', items: [{ id: 'one' }, { id: 'two' }] });
  });

  it('does not combine activity from different turns or across commentary', () => {
    const entries = buildTimelineEntries([
      { ...command('a'), turnId: 'old' },
      { ...command('b'), turnId: 'new' },
      { ...agent('commentary'), phase: 'commentary', turnId: 'new' },
      { type: 'fileChange', id: 'edit', status: 'completed', changes: [], turnId: 'new' }
    ]);
    expect(entries.map(entry => entry.type)).toEqual(['activity', 'activity', 'message', 'activity']);
  });

  it('keeps user steering visible and assigns a single duration to the last response slice', () => {
    const sections = buildTimelineSections(buildTimelineEntries([
      { type: 'userMessage', id: 'u', content: [], turnId: 't' },
      { ...agent('progress'), phase: 'commentary', turnId: 't' },
      { type: 'userMessage', id: 'steer', content: [], turnId: 't' },
      { ...command('c'), turnId: 't' },
      { ...agent('answer'), phase: 'final_answer', turnId: 't' }
    ]));
    expect(sections.map(section => [section.user, section.showTiming, section.entries.length]))
      .toEqual([[true, false, 1], [false, false, 1], [true, false, 1], [false, true, 2]]);
  });
});
