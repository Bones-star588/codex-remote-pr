/** Only explicit UI goal actions are admitted by the remote bridge. */
export function validateGoalMutation(method: string, value: unknown): void {
  if (method !== 'thread/goal/set' && method !== 'thread/goal/clear') return;
  if (!value || typeof value !== 'object') throw new Error('Invalid goal action.');
  const params = value as Record<string, unknown>;
  if (typeof params.threadId !== 'string' || !params.threadId.trim() || params.origin !== 'user') {
    throw new Error('Goal actions require a thread and explicit user origin.');
  }
  const allowed = new Set(method === 'thread/goal/clear' ? ['threadId', 'origin'] : ['threadId', 'origin', 'objective', 'status']);
  if (Object.keys(params).some(key => !allowed.has(key))) throw new Error('Unsupported goal action fields.');
  if (method === 'thread/goal/set' && (params.objective === undefined && params.status === undefined ||
      params.objective !== undefined && (typeof params.objective !== 'string' || !params.objective.trim()) ||
      params.status !== undefined && params.status !== 'active' && params.status !== 'paused')) {
    throw new Error('Invalid goal objective or status.');
  }
}
