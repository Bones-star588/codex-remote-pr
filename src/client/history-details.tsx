import { createContext, useContext, useEffect, useState } from 'react';
import { api, isAbortedRequest } from './api';
import type { ThreadItem } from './types';
import { historyConfig } from './history-config';

export const HistoryThreadContext = createContext<string | null>(null);

export function useHistoryDetails(summary: ThreadItem, open: boolean) {
  const threadId = useContext(HistoryThreadContext);
  const [loaded, setLoaded] = useState<{ threadId: string; summary: ThreadItem; item: ThreadItem } | null>(null);
  const [failure, setFailure] = useState<{ threadId: string; summary: ThreadItem; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const item = loaded?.threadId === threadId && loaded?.summary === summary ? loaded.item : summary;
  useEffect(() => {
    if (!open || !summary.detailsDeferred || item !== summary || !threadId || !summary.turnId) return;
    const controller = new AbortController();
    setFailure(null);
    const query = new URLSearchParams({ threadId, turnId: summary.turnId, itemId: summary.id });
    console.debug('[history-payload] expanding detail');
    void api<{ data: Array<{ turnId: string; item: ThreadItem }> }>(`/api/thread/item?${query}`,
      { signal: controller.signal, timeoutMs: historyConfig.readTimeoutMs, cache: 'no-store' }).then(result => {
      const entry = result && Array.isArray(result.data) && result.data.find(entry => entry?.turnId === summary.turnId &&
        entry.item?.id === summary.id && entry.item.type === summary.type);
      if (!entry) throw new Error('执行详情已不可用。');
      if (!controller.signal.aborted) setLoaded({ threadId, summary, item: { ...entry.item, detailsDeferred: false, turnId: entry.turnId,
        startedAtMs: summary.startedAtMs ?? null, completedAtMs: summary.completedAtMs ?? null } });
    }).catch(error => {
      if (controller.signal.aborted || isAbortedRequest(error)) return;
      console.warn('[history-payload] could not load detail', error);
      setFailure({ threadId, summary, message: error instanceof Error ? error.message : String(error) });
    });
    return () => controller.abort();
  }, [threadId, summary, open, item, attempt]);
  const visibleError = open && item.detailsDeferred
    ? !threadId || !summary.turnId ? '此记录缺少原生定位信息，无法读取执行详情。'
      : failure?.threadId === threadId && failure?.summary === summary ? failure.message : null
    : null;
  return { item, error: visibleError, retry: () => setAttempt(value => value + 1), loading: Boolean(open && item.detailsDeferred && !visibleError) };
}
