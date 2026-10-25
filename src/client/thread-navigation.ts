import type { OutlineTurn } from '../shared/thread-outline';
import { outlineMessages } from '../shared/thread-outline';
import type { TurnTiming } from '../shared/turn-timing';
import type { ThreadItem } from './types';

export function mergeOutlineTurns(current: OutlineTurn[], incoming: OutlineTurn[], nativeSummaries = false): OutlineTurn[] {
  const turns = new Map(current.map(turn => [turn.id, turn]));
  for (const turn of incoming) {
    const existing = turns.get(turn.id);
    const messages = [...(existing?.messages ?? [])];
    for (const message of turn.messages) {
      const index = messages.findIndex(entry => entry.itemId === message.itemId);
      if (index < 0) messages.push(message);
      else messages[index] = { ...message, reply: message.reply || messages[index]!.reply };
    }
    const first = nativeSummaries && turn.messages[0];
    if (first) {
      const index = messages.findIndex(message => message.itemId === first.itemId);
      if (index > 0) messages.unshift(...messages.splice(index, 1));
    }
    turns.set(turn.id, { ...turn, ...(turn.startedAt == null && existing ? existing : {}), messages });
  }
  const next = [...turns.values()].sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity));
  return JSON.stringify(next) === JSON.stringify(current) ? current : next;
}

export function loadedOutline(items: ThreadItem[], timings: Record<string, TurnTiming>): OutlineTurn[] {
  const groups = new Map<string, Array<Extract<ThreadItem, { type: 'userMessage' | 'agentMessage' }>>>();
  for (const item of items) {
    if (!item.turnId || (item.type !== 'userMessage' && item.type !== 'agentMessage')) continue;
    const group = groups.get(item.turnId) ?? [];
    group.push(item);
    groups.set(item.turnId, group);
  }
  return [...groups].map(([id, group]) => ({
    id, status: 'inProgress', startedAt: null, completedAt: null, durationMs: null,
    ...timings[id], messages: outlineMessages(group)
  }));
}
