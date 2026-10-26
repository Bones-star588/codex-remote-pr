import type { Thread, ThreadItem } from './types';
import type { TurnTiming } from '../shared/turn-timing';

export function mergeTurnTimings(current: Record<string, TurnTiming>, latest: TurnTiming[], baseline: Record<string, TurnTiming>): Record<string, TurnTiming> {
  const next = { ...current };
  for (const turn of latest) {
    const existing = current[turn.id];
    next[turn.id] = existing && existing !== baseline[turn.id] ? existing : turn;
  }
  return next;
}

export function findActiveTurnId(turns: Thread['turns'] | undefined): string | null {
  return [...(turns ?? [])].reverse().find((turn) => turn.status === 'inProgress')?.id ?? null;
}

export function displayThreadTitle(thread: Thread): string {
  return thread.name || thread.preview?.split('\n')[0]?.slice(0, 80) || '未命名任务';
}

export function titlesMatch(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/[\u2026\s]+/g, '').trim();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(b.slice(0, 24)) || b.startsWith(a.slice(0, 24));
}

export function upsertItem(items: ThreadItem[], next: ThreadItem, append = false): ThreadItem[] {
  const index = items.findIndex((item) => itemKey(item) === itemKey(next));
  if (index === -1) return [...items, next];
  const copy = [...items];
  const current = copy[index]!;
  if (append && current.type === 'agentMessage' && next.type === 'agentMessage') {
    copy[index] = { ...current, text: `${current.text}${next.text}` };
  } else {
    copy[index] = { ...next,
      ...(next.startedAtMs == null && current.startedAtMs != null ? { startedAtMs: current.startedAtMs } : {}),
      ...(next.completedAtMs == null && current.completedAtMs != null ? { completedAtMs: current.completedAtMs } : {}) };
  }
  return copy;
}

export function itemKey(item: { id: string; turnId?: string }): string {
  return JSON.stringify([item.turnId ?? '', item.id]);
}

export function mergeLatestHistoryItems(
  current: ThreadItem[],
  latest: ThreadItem[],
  snapshotBaseline?: ThreadItem[]
): ThreadItem[] {
  const currentById = new Map(current.map((item, index) => [itemKey(item), { item, index }]));
  const baseline = snapshotBaseline && new Map(snapshotBaseline.map((item) => [itemKey(item), item]));
  const firstShared = latest.map((item) => currentById.get(itemKey(item))?.index).find((index) => index !== undefined);
  let cursor = firstShared ?? current.length;
  const next = current.slice(0, cursor);
  for (const item of latest) {
    const existing = currentById.get(itemKey(item));
    if (!existing) {
      next.push(item);
      continue;
    }
    while (cursor < existing.index) next.push(current[cursor++]!);
    const changedDuringRequest = baseline && baseline.get(itemKey(item)) !== existing.item;
    next.push(changedDuringRequest || JSON.stringify(existing.item) === JSON.stringify(item) ? existing.item : item);
    cursor = existing.index + 1;
  }
  next.push(...current.slice(cursor));
  return next.length === current.length && next.every((item, index) => item === current[index]) ? current : next;
}

export function mergeOlderHistoryItems(older: ThreadItem[], current: ThreadItem[]): ThreadItem[] {
  const currentIds = new Set(current.map(itemKey));
  return [...older.filter((item) => !currentIds.has(itemKey(item))), ...current];
}
