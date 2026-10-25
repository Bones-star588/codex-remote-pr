import type { ThreadItem } from './types';
import { itemKey } from './remote-state';

export type TimelineEntry =
  | { type: 'message'; key: string; item: ThreadItem }
  | { type: 'event'; key: string; item: ThreadItem }
  | {
      type: 'activity';
      key: string;
      kind: ActivityKind;
      kinds: ActivityKind[];
      items: ThreadItem[];
      failedCount: number;
      declinedCount: number;
      running: boolean;
    };

export type ActivityKind = 'command' | 'file' | 'reasoning' | 'tool' | 'search' | 'image';

export function buildTimelineEntries(items: ThreadItem[], activeTurnId: string | null = null): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let activityItems: ThreadItem[] = [];
  const flushActivity = (isLast = false) => {
    if (activityItems.length === 0) return;
    const failedCount = activityItems.filter((item) => 'status' in item && item.status === 'failed').length;
    const declinedCount = activityItems.filter((item) => 'status' in item && item.status === 'declined').length;
    const running = isLast && activeTurnId !== null && activityItems[0]!.turnId === activeTurnId &&
      activityItems[0]!.type !== 'imageView';
    const kinds = [...new Set(activityItems.map((item) => activityKind(item)!))];
    const kind = (['tool', 'file', 'command', 'search', 'image'] as ActivityKind[]).find((kind) => kinds.includes(kind))!;
    entries.push({
      type: 'activity',
      key: `activity-${itemKey(activityItems[0]!)}`,
      kind,
      kinds,
      items: activityItems,
      failedCount,
      declinedCount,
      running
    });
    activityItems = [];
  };

  items.forEach((item) => {
    if (item.type === 'reasoning' || item.type === 'imageGeneration') return;
    if (item.type === 'webSearch' && !item.query?.trim()) return;
    if (activityItems.length > 0 && (item.turnId !== activityItems[0]!.turnId ||
      item.type === 'imageView' || activityItems[0]!.type === 'imageView')) flushActivity();
    if (isConversationItem(item)) {
      flushActivity();
      entries.push({
        type: 'message',
        key: `message-${itemKey(item)}`,
        item
      });
      return;
    }
    if (activityKind(item)) activityItems.push(item);
    else {
      flushActivity();
      entries.push({ type: 'event', key: `event-${itemKey(item)}`, item });
    }
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

export interface TimelineSection {
  key: string;
  turnId: string | undefined;
  entries: TimelineEntry[];
  user: boolean;
  showTiming: boolean;
}

export function buildTimelineSections(entries: TimelineEntry[]): TimelineSection[] {
  const sections: TimelineSection[] = [];
  const lastResponse = new Map<string, TimelineSection>();
  for (const entry of entries) {
    const item = entry.type === 'activity' ? entry.items[0]! : entry.item;
    const user = item.type === 'userMessage';
    let section = sections.at(-1);
    if (!section || user || section.user || section.turnId !== item.turnId) {
      section = { key: entry.key, turnId: item.turnId, entries: [], user, showTiming: false };
      sections.push(section);
    }
    section.entries.push(entry);
    if (!user && item.turnId) lastResponse.set(item.turnId, section);
  }
  for (const section of lastResponse.values()) section.showTiming = true;
  return sections;
}
