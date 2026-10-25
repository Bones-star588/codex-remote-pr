import type { ThreadItem } from './types';
import { itemKey } from './remote-state';

export type TimelineEntry =
  | { type: 'message'; key: string; item: ThreadItem; workedMs?: number | null }
  | {
      type: 'activity';
      key: string;
      items: ThreadItem[];
      failedCount: number;
      running: boolean;
    };

export function buildTimelineEntries(items: ThreadItem[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let activityItems: ThreadItem[] = [];
  const turnStarts = new Map<string, number>();

  const flushActivity = () => {
    if (activityItems.length === 0) return;
    const failedCount = activityItems.filter(isFailedItem).length;
    const running = activityItems.some(isRunningItem);
    entries.push({
      type: 'activity',
      key: `activity-${itemKey(activityItems[0]!)}`,
      items: activityItems,
      failedCount,
      running
    });
    activityItems = [];
  };

  items.forEach((item) => {
    if (item.type === 'userMessage' && item.turnId && item.startedAtMs != null && !turnStarts.has(item.turnId)) {
      turnStarts.set(item.turnId, item.startedAtMs);
    }
    if (activityItems.length > 0 && item.turnId !== activityItems[0]!.turnId) flushActivity();
    if (item.type === 'agentMessage' && item.phase === 'commentary' && activityItems.length > 0) {
      activityItems.push(item);
      return;
    }
    if (isConversationItem(item)) {
      const hasActivity = activityItems.length > 0;
      flushActivity();
      const turnStart = item.turnId ? turnStarts.get(item.turnId) : undefined;
      const workedMs = turnStart !== undefined && item.completedAtMs != null
        ? Math.max(0, item.completedAtMs - turnStart) : null;
      entries.push({
        type: 'message',
        key: `message-${itemKey(item)}`,
        item,
        ...(item.type === 'agentMessage' && hasActivity && item.phase !== 'commentary' ? { workedMs } : {})
      });
      return;
    }
    activityItems.push(item);
  });
  flushActivity();
  return entries;
}

export function isConversationItem(item: ThreadItem): boolean {
  return item.type === 'userMessage' || item.type === 'agentMessage';
}

function isFailedItem(item: ThreadItem): boolean {
  return 'status' in item && (item.status === 'failed' || item.status === 'declined');
}

function isRunningItem(item: ThreadItem): boolean {
  return 'status' in item && item.status === 'inProgress';
}
