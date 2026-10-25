import { describe, expect, it } from 'vitest';

import { buildTimelineEntries } from './timeline-model';
import type { ThreadItem } from './types';

function command(id: string, status: 'inProgress' | 'completed' | 'failed' = 'completed'): ThreadItem {
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
  it('merges contiguous activity into one foldable entry', () => {
    const entries = buildTimelineEntries([
      command('one'),
      { type: 'reasoning', id: 'reason', summary: ['Thinking'], content: [] },
      command('two', 'failed')
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'activity',
      failedCount: 1,
      running: false
    });
    expect(entries[0]?.type === 'activity' ? entries[0].items : []).toHaveLength(3);
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
    expect(entries[2]).toMatchObject({ type: 'activity', running: true });
  });

  it('folds intermediate commentary with tools while keeping the final answer visible', () => {
    const entries = buildTimelineEntries([
      { type: 'userMessage', id: 'user', content: [], turnId: 't', startedAtMs: 1000 },
      { ...agent('intro'), turnId: 't', phase: 'commentary' },
      { ...command('one'), turnId: 't' },
      { ...agent('progress'), turnId: 't', phase: 'commentary' },
      { ...command('two'), turnId: 't' },
      { ...agent('final'), turnId: 't', phase: 'final_answer', startedAtMs: 1000, completedAtMs: 9000 }
    ]);
    expect(entries.map((entry) => entry.type)).toEqual(['message', 'message', 'activity', 'message']);
    expect(entries[2]?.type === 'activity' && entries[2].items).toHaveLength(3);
    expect(entries[3]).toMatchObject({ type: 'message', workedMs: 8000 });
  });

  it('keeps an activity group mounted when more output arrives', () => {
    const first = command('one');
    const initial = buildTimelineEntries([first]);
    const updated = buildTimelineEntries([first, command('two'), agent('final')]);
    expect(initial[0]?.key).toBe(updated[0]?.key);
  });
});
