import type { Thread, ThreadHistoryPage } from './types';

export type ThreadListPage = {
  data: Thread[];
  nextCursor: string | null;
  snapshot?: { stale: boolean; savedAt: number };
};

export type OpenThreadPage = ThreadHistoryPage & {
  result: { thread: Thread; collaborationMode?: Thread['collaborationMode'] };
  snapshot?: { stale: boolean; savedAt: number };
  timingsPending?: boolean;
};

export function provisionalThread(thread: Thread): Thread {
  return { ...thread, status: { type: 'notLoaded' }, permissionProfile: null };
}

export function provisionalHistory(page: ThreadHistoryPage): ThreadHistoryPage {
  return {
    ...page,
    items: page.items.filter(({ item }) => item.type !== 'subAgentActivity' && item.type !== 'collabAgentToolCall' &&
      !('status' in item && item.status === 'inProgress')),
    activeTurnId: null,
    turns: page.turns.filter(turn => turn.status !== 'inProgress'),
    nextCursor: null,
    turnsCursor: null
  };
}

export function applyTaskPage(current: Thread[], page: Thread[], provisional: Map<string, Thread>): Thread[] {
  const byId = new Map(page.map(thread => [thread.id, thread]));
  return current.map(thread => provisional.get(thread.id) === thread ? byId.get(thread.id) ?? thread : thread);
}
