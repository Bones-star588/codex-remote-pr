import { describe, expect, it } from 'vitest';

import { elapsedTurnMs, formatWorkDuration, type TurnTiming } from './turn-timing';

const turn: TurnTiming = { id: 't', status: 'inProgress', startedAt: 100, completedAt: null, durationMs: null };

describe('native turn timing', () => {
  it('converts native Unix seconds to elapsed milliseconds without depending on loaded user messages', () => {
    expect(elapsedTurnMs(turn, 147_000)).toBe(47_000);
    expect(elapsedTurnMs(turn, 148_000)).toBe(48_000);
  });

  it('uses the precise native duration for a completed or interrupted turn', () => {
    expect(elapsedTurnMs({ ...turn, status: 'completed', completedAt: 200, durationMs: 99_987 }, 999_000)).toBe(99_987);
    expect(elapsedTurnMs({ ...turn, status: 'interrupted', completedAt: 150 }, 999_000)).toBe(50_000);
  });

  it('does not invent a duration for missing timestamps or a failed turn without an end', () => {
    expect(elapsedTurnMs({ ...turn, startedAt: null }, 147_000)).toBeNull();
    expect(elapsedTurnMs({ ...turn, status: 'failed' }, 147_000)).toBeNull();
    expect(elapsedTurnMs(turn, 90_000)).toBe(0);
  });

  it('formats seconds and minute/hour boundaries without rounding to 60 seconds', () => {
    expect(formatWorkDuration(59_999)).toBe('59秒');
    expect(formatWorkDuration(60_000)).toBe('1分钟 0秒');
    expect(formatWorkDuration(1_013_000)).toBe('16分钟 53秒');
    expect(formatWorkDuration(3_661_000)).toBe('1小时 1分钟 1秒');
  });
});
