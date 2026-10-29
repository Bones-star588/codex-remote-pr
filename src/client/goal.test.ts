import { describe, expect, it } from 'vitest';
import { goalElapsedMs, goalStatusLabel, parseThreadGoal } from './goal';

const goal = {
  threadId: 'thread', objective: '完成远程控制', status: 'active', tokenBudget: 10_000,
  tokensUsed: 120, timeUsedSeconds: 45, createdAt: 1_700_000_000, updatedAt: 1_700_000_123
};

describe('thread goals', () => {
  it('parses native goal responses and rejects invalid numeric values', () => {
    expect(parseThreadGoal({ goal })).toEqual(goal);
    expect(parseThreadGoal({ goal: { ...goal, tokensUsed: Number.NaN } })).toBeNull();
    expect(parseThreadGoal({ goal: { ...goal, status: 'unknown' } })).toBeNull();
  });

  it('continues counting an active goal from the last native update', () => {
    const parsed = parseThreadGoal({ goal });
    expect(parsed).not.toBeNull();
    expect(goalElapsedMs(parsed!, 1_700_000_124_500)).toBe(46_500);
    expect(goalElapsedMs({ ...parsed!, status: 'complete' }, 1_700_100_000_000)).toBe(45_000);
  });

  it('labels every native goal state', () => {
    expect(goalStatusLabel('active')).toBe('Goal 运行中');
    expect(goalStatusLabel('complete')).toBe('Goal 已完成');
  });
});
