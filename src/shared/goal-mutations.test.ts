import { describe, expect, it } from 'vitest';
import { validateGoalMutation } from './goal-mutations';

describe('explicit remote goal actions', () => {
  it('accepts pause, start, objective edits and deletion with user provenance', () => {
    for (const update of [{ status: 'paused' }, { status: 'active' }, { objective: 'A new objective' }]) {
      expect(() => validateGoalMutation('thread/goal/set', { threadId: 'chat', origin: 'user', ...update })).not.toThrow();
    }
    expect(() => validateGoalMutation('thread/goal/clear', { threadId: 'chat', origin: 'user' })).not.toThrow();
  });
  it('rejects missing authorization, empty values, invalid states and extra fields', () => {
    for (const value of [null, {}, { threadId: 'chat', origin: 'automatic', status: 'paused' },
      { threadId: '', origin: 'user', status: 'active' }, { threadId: 'chat', origin: 'user' },
      { threadId: 'chat', origin: 'user', objective: ' ' }, { threadId: 'chat', origin: 'user', status: 'complete' },
      { threadId: 'chat', origin: 'user', status: 'paused', tokenBudget: -1 }]) {
      expect(() => validateGoalMutation('thread/goal/set', value)).toThrow();
    }
    expect(() => validateGoalMutation('thread/goal/clear', { threadId: 'chat', origin: 'user', objective: 'x' })).toThrow();
  });
});
