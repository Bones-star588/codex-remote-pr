import { describe, expect, it } from 'vitest';
import { compactHistoryEntries } from './history-payload.js';

const entry = (item: Record<string, unknown>) => ({ turnId: 'turn', startedAtMs: 10, completedAtMs: 20, item });
describe('bounded conversation payloads', () => {
  it('defers folded tool bodies without losing item identities, times, paths or conversation text', () => {
    const body = 'synthetic output'.repeat(10000);
    const entries = [
      entry({ id: 'u', type: 'userMessage', content: [{ type: 'text', text: body }] }),
      entry({ id: 'cmd', type: 'commandExecution', command: body, aggregatedOutput: body, status: 'completed' }),
      entry({ id: 'f', type: 'fileChange', changes: [{ path: 'example.ts', diff: body, kind: 'update' }] }),
      entry({ id: 'r', type: 'reasoning', content: [body], summary: [body] }),
      entry({ id: 'm', type: 'mcpToolCall', server: 's', tool: 't', arguments: body, result: body }),
      entry({ id: 'd', type: 'dynamicToolCall', tool: 't', arguments: body, contentItems: body }),
      entry({ id: 'a', type: 'agentMessage', text: body, delivery: 'async', questions: [{ title: 'Choose?', options: ['A'] }] }),
      entry({ id: 'unknown', type: 'newNativeItem', payload: body })
    ];
    const before = JSON.stringify(entries);
    const compact = compactHistoryEntries(entries);
    expect(compact.map(({ item, ...metadata }) => ({ id: item.id, ...metadata })))
      .toEqual(entries.map(({ item, ...metadata }) => ({ id: item.id, ...metadata })));
    for (const index of [0, 2, 6, 7]) expect(compact[index]).toBe(entries[index]);
    expect(compact[1]?.item).toMatchObject({ detailsDeferred: true, aggregatedOutput: null });
    expect(String(compact[1]?.item.command)).toHaveLength(240);
    expect(compact[2]).toBe(entries[2]);
    expect(compact[3]?.item).toMatchObject({ content: [], summary: [] });
    expect(compact[4]?.item).toMatchObject({ detailsDeferred: true, arguments: null, result: null });
    expect(compact[5]?.item).toMatchObject({ detailsDeferred: true, arguments: null, contentItems: null });
    expect(JSON.stringify(entries)).toBe(before); // Native snapshots are never mutated.
    expect(compactHistoryEntries(compact)).toEqual(compact);
  });
  it('preserves empty and unknown native items', () => {
    const entries = [{ item: null }, { item: 'future-native-shape' }, { item: { type: 'fileChange', changes: null } }];
    expect(compactHistoryEntries(entries)).toEqual(entries);
    expect(compactHistoryEntries([])).toEqual([]);
  });
});
