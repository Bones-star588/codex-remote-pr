/** Preserve history identities and cursors while deferring folded execution bodies. */
export function compactHistoryEntries<T extends { item: unknown }>(entries: T[]): T[] {
  let deferred = 0;
  const compact = entries.map(entry => {
    if (!entry.item || typeof entry.item !== 'object') return entry;
    const item = entry.item as Record<string, unknown>;
    let next: Record<string, unknown> | undefined;
    if (item.type === 'reasoning') next = { ...item, summary: [], content: [] };
    else if (item.type === 'commandExecution' && typeof item.command === 'string') {
      next = { ...item, command: item.command.slice(0, 240), aggregatedOutput: null, detailsDeferred: true };
    } else if (item.type === 'mcpToolCall' || item.type === 'dynamicToolCall') {
      next = { ...item, arguments: null, result: null, contentItems: null, detailsDeferred: true };
    }
    // File diffs are also consumed by the review inspector; keep those complete.
    if (!next) return entry;
    if (next.detailsDeferred) deferred++;
    return { ...entry, item: next };
  });
  console.debug('[history-payload] compacted', { count: entries.length, deferred,
    inputBytes: Buffer.byteLength(JSON.stringify(entries)), outputBytes: Buffer.byteLength(JSON.stringify(compact)) });
  return compact;
}
