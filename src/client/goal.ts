import type { ThreadGoal, ThreadGoalStatus } from './types';

const statuses = new Set<ThreadGoalStatus>(['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function finiteNumber(value: unknown, fallback: number | null = null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parseThreadGoal(value: unknown): ThreadGoal | null {
  const root = record(value);
  const source = record(root?.goal) ?? root;
  if (!source || typeof source.threadId !== 'string' || typeof source.objective !== 'string' ||
      typeof source.status !== 'string' || !statuses.has(source.status as ThreadGoalStatus)) return null;
  const tokenBudget = source.tokenBudget === null ? null : finiteNumber(source.tokenBudget);
  const tokensUsed = finiteNumber(source.tokensUsed);
  const timeUsedSeconds = finiteNumber(source.timeUsedSeconds);
  const createdAt = finiteNumber(source.createdAt);
  const updatedAt = finiteNumber(source.updatedAt);
  if (source.tokenBudget !== null && tokenBudget === null || tokensUsed === null || timeUsedSeconds === null || createdAt === null || updatedAt === null ||
      tokenBudget !== null && tokenBudget < 0 || tokensUsed < 0 || timeUsedSeconds < 0 || createdAt < 0 || updatedAt < 0) return null;
  return {
    threadId: source.threadId,
    objective: source.objective,
    status: source.status as ThreadGoalStatus,
    tokenBudget,
    tokensUsed,
    timeUsedSeconds,
    createdAt,
    updatedAt
  };
}

export function goalElapsedMs(goal: ThreadGoal, nowMs: number): number {
  const base = Math.max(0, goal.timeUsedSeconds) * 1000;
  if (goal.status !== 'active') return base;
  return base + Math.max(0, nowMs - goal.updatedAt * 1000);
}

export function goalStatusLabel(status: ThreadGoalStatus): string {
  switch (status) {
    case 'active': return 'Goal 运行中';
    case 'paused': return 'Goal 已暂停';
    case 'blocked': return 'Goal 已阻塞';
    case 'usageLimited': return 'Goal 达到用量限制';
    case 'budgetLimited': return 'Goal 达到预算限制';
    case 'complete': return 'Goal 已完成';
  }
}
