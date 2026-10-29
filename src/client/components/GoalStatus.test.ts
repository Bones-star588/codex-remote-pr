import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoalStatus } from './GoalStatus';
import type { ThreadGoal } from '../types';

const goal: ThreadGoal = { threadId: 'chat', objective: 'A synthetic objective', status: 'active',
  tokenBudget: null, tokensUsed: 1, timeUsedSeconds: 1, createdAt: 1, updatedAt: 1 };
const controls = { onUpdate: async () => {}, onDelete: async () => {}, disabled: false };
describe('goal dock controls', () => {
  it('offers pause, edit and delete for an active goal', () => {
    const html = renderToStaticMarkup(createElement(GoalStatus, { goal, ...controls }));
    for (const label of ['暂停 Goal', '编辑 Goal', '删除 Goal', '持续']) expect(html).toContain(label);
    expect(html).not.toContain('开始 Goal');
  });
  it('offers start for an inactive goal and disables actions while transport is unavailable', () => {
    const html = renderToStaticMarkup(createElement(GoalStatus, { goal: { ...goal, status: 'paused' }, ...controls, disabled: true }));
    expect(html).toContain('开始 Goal');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
  it('does not invent a goal when the native goal is absent', () => {
    expect(renderToStaticMarkup(createElement(GoalStatus, { goal: null, ...controls }))).toBe('');
  });
});
