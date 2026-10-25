import type { ThreadItem } from './types';
import { itemKey } from './remote-state';

export type TimelineEntry =
  | { type: 'message'; key: string; item: ThreadItem; workedMs?: number | null }
  | { type: 'event'; key: string; item: ThreadItem }
  | {
      type: 'activity';
      key: string;
      kind: ActivityKind;
      items: ThreadItem[];
      failedCount: number;
      declinedCount: number;
      running: boolean;
    };

export type ActivityKind = 'command' | 'file' | 'reasoning' | 'tool' | 'search' | 'image';

export function buildTimelineEntries(items: ThreadItem[], activeTurnId: string | null = null): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let activityItems: ThreadItem[] = [];
  const turnStarts = new Map<string, number>();
  const activityTurns = new Set<string>();

  const flushActivity = (isLast = false) => {
    if (activityItems.length === 0) return;
    const failedCount = activityItems.filter((item) => 'status' in item && item.status === 'failed').length;
    const declinedCount = activityItems.filter((item) => 'status' in item && item.status === 'declined').length;
    const running = isLast && activeTurnId !== null && activityItems[0]!.turnId === activeTurnId;
    entries.push({
      type: 'activity',
      key: `activity-${itemKey(activityItems[0]!)}`,
      kind: activityKind(activityItems[0]!)!,
      items: activityItems,
      failedCount,
      declinedCount,
      running
    });
    activityItems = [];
  };

  items.forEach((item) => {
    if (item.type === 'reasoning' && ![...item.summary, ...item.content].some((part) => part.trim())) return;
    if (item.type === 'userMessage' && item.turnId && item.startedAtMs != null && !turnStarts.has(item.turnId)) {
      turnStarts.set(item.turnId, item.startedAtMs);
    }
    if (activityItems.length > 0 && (item.turnId !== activityItems[0]!.turnId ||
      activityKind(item) !== activityKind(activityItems[0]!))) flushActivity();
    if (isConversationItem(item)) {
      const hasActivity = activityItems.length > 0 || Boolean(item.turnId && activityTurns.has(item.turnId));
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
    if (item.turnId) activityTurns.add(item.turnId);
    if (activityKind(item)) activityItems.push(item);
    else entries.push({ type: 'event', key: `event-${itemKey(item)}`, item });
  });
  flushActivity(true);
  return entries;
}

function activityKind(item: ThreadItem): ActivityKind | null {
  switch (item.type) {
    case 'commandExecution': return 'command';
    case 'fileChange': return 'file';
    case 'reasoning': return 'reasoning';
    case 'mcpToolCall':
    case 'dynamicToolCall': return 'tool';
    case 'webSearch': return 'search';
    case 'imageView': return 'image';
    default: return null;
  }
}

export function isConversationItem(item: ThreadItem): boolean {
  return item.type === 'userMessage' || item.type === 'agentMessage';
}

export function isActivityIssue(item: ThreadItem): boolean {
  return 'status' in item && (item.status === 'failed' || item.status === 'declined');
}
