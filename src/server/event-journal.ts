import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '../shared/protocol.js';

interface Entry {
  sequence: number;
  at: number;
  bytes: number;
  payload: string;
  threadId: string | null;
}

export class EventJournal {
  epoch = randomUUID();
  sequence = 0;
  private entries: Entry[] = [];
  private bytes = 0;
  private discardedThrough = 0;

  constructor(private readonly maxBytes = 2 * 1024 * 1024, private readonly maxAge = 90_000) {}

  append(message: ServerMessage): Entry {
    const payload = JSON.stringify({ ...message, epoch: this.epoch, sequence: ++this.sequence });
    const entry = { sequence: this.sequence, at: Date.now(), bytes: Buffer.byteLength(payload),
      payload, threadId: watchedThreadId(message) };
    this.entries.push(entry);
    this.bytes += entry.bytes;
    this.trim();
    return entry;
  }

  resume(epoch: string | null, after: number, threadIds: Set<string>) {
    this.trim();
    const resumed = epoch === this.epoch && Number.isSafeInteger(after) &&
      after >= this.discardedThrough && after <= this.sequence;
    return { epoch: this.epoch, sequence: this.sequence, resumed,
      entries: resumed ? this.entries.filter(entry => entry.sequence > after &&
        (!entry.threadId || threadIds.has(entry.threadId))) : [] };
  }

  reset(): void {
    this.epoch = randomUUID();
    this.entries = [];
    this.bytes = 0;
    this.sequence = 0;
    this.discardedThrough = 0;
  }

  private trim(): void {
    const cutoff = Date.now() - this.maxAge;
    while (this.entries.length && (this.bytes > this.maxBytes || this.entries[0]!.at < cutoff)) {
      const entry = this.entries.shift()!;
      this.bytes -= entry.bytes;
      this.discardedThrough = entry.sequence;
    }
  }
}

export function watchedThreadId(message: ServerMessage): string | null {
  return message.type === 'event' && /^(item|turn)\//.test(message.method)
    ? (message.params as { threadId?: string })?.threadId ?? null : null;
}
