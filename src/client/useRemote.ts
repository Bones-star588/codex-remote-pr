import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ClientRpcMethod, ServerMessage } from '../shared/protocol';
import { permissionProfileId, permissionProfileUpdate, type PermissionProfile, type PermissionSettings } from '../shared/permissions';
import { api } from './api';
import { RemoteConnection } from './remote-connection';
import { itemKey, mergeLatestHistoryItems, mergeOlderHistoryItems, upsertItem } from './remote-state';
import type {
  BridgeStatus,
  ModelInfo,
  ProjectInfo,
  ServerRequest,
  Thread,
  ThreadHistoryPage,
  ThreadItem
} from './types';
import type { ComposerAttachment, ContextUsage } from './types';
import { dedupeThreads } from './workspace-model';

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

interface PendingServerResponse {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
}

interface UseRemoteOptions {
  authenticated: boolean;
  onAuthExpired?: () => void;
}

export interface ThreadSettingsPatch {
  model?: string;
  effort?: string;
  permissions?: string;
}

export interface CreateThreadOptions {
  cwd?: string;
  projectId?: string;
  model?: string;
  effort?: string;
  permissions?: string;
}

export function useRemote({ authenticated, onAuthExpired }: UseRemoteOptions) {
  const [connected, setConnected] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ status: 'offline' });
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [permissionProfiles, setPermissionProfiles] = useState<PermissionProfile[]>([]);
  const [defaultPermissionProfile, setDefaultPermissionProfile] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [tokenUsage, setTokenUsage] = useState<Record<string, ContextUsage>>({});
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [serverRequests, setServerRequests] = useState<ServerRequest[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, PendingRpc>());
  const pendingServerResponsesRef = useRef(new Map<string, PendingServerResponse>());
  const refreshThreadsTimerRef = useRef<number | null>(null);
  const activeThreadRef = useRef<string | null>(null);
  const threadsRef = useRef(threads);
  const activeTurnIdRef = useRef<string | null>(null);
  const turnRevisionRef = useRef(0);
  const itemsRef = useRef(items);
  const olderHistoryCursorRef = useRef<string | null>(null);
  const selectionVersionRef = useRef(0);
  const historyRefreshRef = useRef<Promise<void> | null>(null);
  const listRefreshRef = useRef<Promise<Thread[]> | null>(null);
  const archivedRef = useRef(false);
  const newThreadsRef = useRef(new Set<string>());
  const permissionRequestVersionRef = useRef(0);
  const loadingHistoryRef = useRef(false);
  const streamFlushTimerRef = useRef<number | null>(null);
  const agentDeltasRef = useRef(new Map<string, string>());
  const commandDeltasRef = useRef(new Map<string, string>());
  const disposedRef = useRef(false);
  const authExpiredRef = useRef(onAuthExpired);

  activeThreadRef.current = activeThreadId;
  threadsRef.current = threads;
  itemsRef.current = items;
  activeTurnIdRef.current = activeTurnId;
  authExpiredRef.current = onAuthExpired;

  const rpc = useCallback(<T,>(method: ClientRpcMethod, params: unknown = {}): Promise<T> => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Remote connection is not ready.'));
    }
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (!pendingRef.current.has(id)) return;
        pendingRef.current.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, 120_000);
      pendingRef.current.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      socket.send(JSON.stringify({ type: 'rpc', id, method, params }));
    });
  }, []);

  const watchThread = useCallback((threadId: string | null) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'thread.watch', threadId }));
    }
  }, []);

  const refreshThreads = useCallback((): Promise<Thread[]> => {
    if (listRefreshRef.current) return listRefreshRef.current;
    const archived = archivedRef.current;
    const request = (async () => {
    setThreadsLoading(true);
    try {
      const collected: Thread[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      while (true) {
        const result: { data: Thread[]; nextCursor: string | null } = await rpc('thread/list', {
          limit: 200,
          sortKey: 'updated_at',
          sortDirection: 'desc',
          useStateDbOnly: true,
          modelProviders: [],
          archived,
          ...(cursor ? { cursor } : {})
        });
        collected.push(...(result.data ?? []).map((thread) => ({ ...thread, archived })));
        if (!result.nextCursor || seenCursors.has(result.nextCursor)) break;
        seenCursors.add(result.nextCursor);
        cursor = result.nextCursor;
      }
      const nextThreads = dedupeThreads(collected);
      if (archived === archivedRef.current) {
        setThreads((current) => JSON.stringify(current) === JSON.stringify(nextThreads) ? current : nextThreads);
      }
      return nextThreads;
    } finally {
      setThreadsLoading(false);
      listRefreshRef.current = null;
    }
    })();
    listRefreshRef.current = request;
    return request;
  }, [rpc]);

  const refreshProjects = useCallback(async () => {
    const result = await rpc<{ data: ProjectInfo[] }>('project/list', { limit: 200 });
    setProjects(result.data ?? []);
  }, [rpc]);

  const fetchHistoryPage = useCallback(async (threadId: string, before: string | null = null) => {
    const query = new URLSearchParams({ threadId, limit: '200' });
    if (before !== null) query.set('before', String(before));
    return api<ThreadHistoryPage>(`/api/thread/history?${query.toString()}`, { cache: 'no-store' });
  }, []);

  const refreshPermissions = useCallback(async (cwd?: string) => {
    const version = ++permissionRequestVersionRef.current;
    const query = new URLSearchParams(cwd ? { cwd } : {});
    const result = await api<{ data: PermissionProfile[]; defaultProfile: string | null }>(`/api/permissions?${query}`, { cache: 'no-store' });
    if (version !== permissionRequestVersionRef.current) return;
    setPermissionProfiles(result.data);
    setDefaultPermissionProfile(result.defaultProfile);
  }, []);

  const clearStreamingDeltas = useCallback(() => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    agentDeltasRef.current.clear();
    commandDeltasRef.current.clear();
  }, []);

  const flushStreamingDeltas = useCallback(() => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    const agentDeltas = new Map(agentDeltasRef.current);
    const commandDeltas = new Map(commandDeltasRef.current);
    agentDeltasRef.current.clear();
    commandDeltasRef.current.clear();
    if (agentDeltas.size === 0 && commandDeltas.size === 0) return;

    setItems((current) => {
      let next = current;
      for (const [key, delta] of agentDeltas) {
        const [turnId, itemId] = JSON.parse(key) as [string, string];
        next = upsertItem(
          next,
          {
            type: 'agentMessage',
            id: itemId,
            turnId,
            text: delta
          } as ThreadItem,
          true
        );
      }
      if (commandDeltas.size > 0) {
        next = next.map((item) =>
          item.type === 'commandExecution' && commandDeltas.has(itemKey(item))
            ? {
                ...item,
                aggregatedOutput: `${item.aggregatedOutput ?? ''}${commandDeltas.get(itemKey(item)) ?? ''}`
              }
            : item
        );
      }
      return next;
    });
  }, []);

  const queueStreamingDelta = useCallback(
    (kind: 'agent' | 'command', itemId: string, delta: string, turnId: string) => {
      const target = kind === 'agent' ? agentDeltasRef.current : commandDeltasRef.current;
      const key = itemKey({ id: itemId, turnId });
      target.set(key, `${target.get(key) ?? ''}${delta}`);
      if (streamFlushTimerRef.current !== null) return;
      streamFlushTimerRef.current = window.setTimeout(() => {
        streamFlushTimerRef.current = null;
        flushStreamingDeltas();
      }, 60);
    },
    [flushStreamingDeltas]
  );

  const openThread = useCallback(
    async (
      threadId: string,
      options: { silent?: boolean; preserveHistory?: boolean } = {}
    ) => {
      if (options.silent && activeThreadRef.current !== threadId) return;
      if (!options.silent) {
        selectionVersionRef.current += 1;
        activeThreadRef.current = threadId;
        watchThread(threadId);
        setActiveThreadId(threadId);
        setActiveThread(threadsRef.current.find((thread) => thread.id === threadId) ?? null);
        setItems([]);
        olderHistoryCursorRef.current = null;
        setHasMoreHistory(false);
        setActiveTurnId(null);
        activeTurnIdRef.current = null;
      }
      const version = selectionVersionRef.current;
      const baseline = options.silent ? itemsRef.current : [];
      const turnRevision = turnRevisionRef.current;
      if (options.silent) flushStreamingDeltas();
      else clearStreamingDeltas();
      if (!options.silent) {
        loadingHistoryRef.current = false;
        setLoadingHistory(false);
      }
      if (!options.silent) setLoadingThread(true);
      setLastError(null);
      try {
        const isNew = newThreadsRef.current.has(threadId);
        const archived = threadsRef.current.find((thread) => thread.id === threadId)?.archived;
        const [result, page] = await Promise.all([
          isNew || archived
            ? rpc<{ thread: Thread } & PermissionSettings>('thread/read', { threadId, includeTurns: false })
            : rpc<{ thread: Thread } & PermissionSettings>('thread/resume', { threadId, excludeTurns: true }),
          isNew ? Promise.resolve({ items: [], nextCursor: null, activeTurnId: null } as ThreadHistoryPage) : fetchHistoryPage(threadId)
        ]);
        const thread = { ...result.thread, permissionProfile: permissionProfileId(result), archived: Boolean(archived) };
        const historyItems = page.items.map((entry) => ({
          ...entry.item, turnId: entry.turnId,
          startedAtMs: entry.startedAtMs, completedAtMs: entry.completedAtMs
        }));
        if (version !== selectionVersionRef.current || activeThreadRef.current !== threadId) return;
        flushStreamingDeltas();
        const historyKeys = new Set(historyItems.map(itemKey));
        const preserveHistory =
          Boolean(options.preserveHistory) && baseline.some((item) => historyKeys.has(itemKey(item)));
        setActiveThreadId(threadId);
        setActiveThread(thread);
        if (turnRevisionRef.current === turnRevision) {
          activeTurnIdRef.current = page.activeTurnId;
          setActiveTurnId(page.activeTurnId);
        }
        setItems((current) => {
          if (preserveHistory) return mergeLatestHistoryItems(current, historyItems, baseline);
          const baselineById = new Map(baseline.map((item) => [itemKey(item), item]));
          const liveItems = current.filter((item) => baselineById.get(itemKey(item)) !== item);
          return mergeLatestHistoryItems(historyItems, liveItems);
        });
        if (!preserveHistory) {
          olderHistoryCursorRef.current = page.nextCursor;
          setHasMoreHistory(page.nextCursor !== null);
        }
      } catch (error) {
        if (version === selectionVersionRef.current) setLastError(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        if (version === selectionVersionRef.current) {
          if (!options.silent) setLoadingHistory(false);
          if (!options.silent) setLoadingThread(false);
        }
      }
    },
    [clearStreamingDeltas, fetchHistoryPage, flushStreamingDeltas, rpc, watchThread]
  );

  const loadEarlierHistory = useCallback(async () => {
    const threadId = activeThreadRef.current;
    const cursor = olderHistoryCursorRef.current;
    const version = selectionVersionRef.current;
    if (!threadId || cursor === null || loadingHistoryRef.current) return;
    loadingHistoryRef.current = true;
    setLoadingHistory(true);
    try {
      const page = await fetchHistoryPage(threadId, cursor);
      if (threadId !== activeThreadRef.current || version !== selectionVersionRef.current) return;
      const olderItems = page.items.map((entry) => ({
        ...entry.item, turnId: entry.turnId,
        startedAtMs: entry.startedAtMs, completedAtMs: entry.completedAtMs
      }));
      setItems((current) => mergeOlderHistoryItems(olderItems, current));
      olderHistoryCursorRef.current = page.nextCursor;
      setHasMoreHistory(page.nextCursor !== null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      if (version === selectionVersionRef.current) {
        loadingHistoryRef.current = false;
        setLoadingHistory(false);
      }
    }
  }, [fetchHistoryPage]);

  const closeThread = useCallback(() => {
    selectionVersionRef.current += 1;
    activeThreadRef.current = null;
    watchThread(null);
    clearStreamingDeltas();
    olderHistoryCursorRef.current = null;
    loadingHistoryRef.current = false;
    setActiveThreadId(null);
    setActiveThread(null);
    setActiveTurnId(null);
    setItems([]);
    setHasMoreHistory(false);
    setLoadingHistory(false);
    setLoadingThread(false);
  }, [clearStreamingDeltas, watchThread]);

  const createThread = useCallback(
    async (options: CreateThreadOptions = {}) => {
      clearStreamingDeltas();
      const result = await rpc<{ thread: Thread } & PermissionSettings>('thread/start', {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.projectId ? { projectId: options.projectId } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.permissions ? permissionProfileUpdate(options.permissions) : {})
      });
      newThreadsRef.current.add(result.thread.id);
      let thread = { ...result.thread, permissionProfile: permissionProfileId(result) };
      if (options.effort) {
        await rpc('thread/settings/update', { threadId: thread.id, effort: options.effort });
        thread = { ...thread, reasoningEffort: options.effort };
      }
      setThreads((current) => dedupeThreads([...current, thread]));
      selectionVersionRef.current += 1;
      activeThreadRef.current = thread.id;
      watchThread(thread.id);
      setActiveThreadId(result.thread.id);
      setActiveThread(thread);
      olderHistoryCursorRef.current = null;
      loadingHistoryRef.current = false;
      setActiveTurnId(null);
      setItems([]);
      setHasMoreHistory(false);
      setLoadingHistory(false);
      return thread;
    },
    [clearStreamingDeltas, rpc, watchThread]
  );

  const sendTurn = useCallback(
    async (threadId: string, text: string, settings: ThreadSettingsPatch = {}, attachments: ComposerAttachment[] = []) => {
      const clean = text.trim();
      if (!clean && attachments.length === 0) return;

      if (!newThreadsRef.current.has(threadId)) await rpc('thread/resume', { threadId, excludeTurns: true });
      const result = await rpc<{ turn: { id: string } }>('turn/start', {
        threadId,
        input: [
          ...(clean ? [{ type: 'text', text: clean, text_elements: [] }] : []),
          ...attachments.map((attachment) => ({ type: 'image', url: attachment.url }))
        ],
        ...(settings.model ? { model: settings.model } : {}),
        ...(settings.effort ? { effort: settings.effort } : {}),
        ...(settings.permissions ? permissionProfileUpdate(settings.permissions) : {})
      });
      newThreadsRef.current.delete(threadId);
      if (result.turn?.id && activeThreadRef.current === threadId) {
        turnRevisionRef.current += 1;
        activeTurnIdRef.current = result.turn.id;
        setActiveTurnId(result.turn.id);
      }
      return result.turn?.id;
    },
    [rpc]
  );

  const setThreadSettings = useCallback(
    async (threadId: string, settings: ThreadSettingsPatch) => {
      await rpc('thread/settings/update', {
        threadId, ...settings,
        ...(settings.permissions ? permissionProfileUpdate(settings.permissions) : {})
      });
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                ...(settings.model ? { model: settings.model } : {}),
                ...(settings.effort ? { reasoningEffort: settings.effort } : {}),
                ...(settings.permissions ? { permissionProfile: settings.permissions } : {})
              }
            : thread
        )
      );
      setActiveThread((current) =>
        current?.id === threadId
          ? {
              ...current,
              ...(settings.model ? { model: settings.model } : {}),
              ...(settings.effort ? { reasoningEffort: settings.effort } : {}),
              ...(settings.permissions ? { permissionProfile: settings.permissions } : {})
            }
          : current
      );
    },
    [rpc]
  );

  const renameThread = useCallback(async (threadId: string, name: string) => {
    await rpc('thread/name/set', { threadId, name });
    setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, name } : thread));
    setActiveThread((current) => current?.id === threadId ? { ...current, name } : current);
  }, [rpc]);

  const archiveThread = useCallback(async (threadId: string, archived: boolean) => {
    await rpc(archived ? 'thread/archive' : 'thread/unarchive', { threadId });
    if (activeThreadRef.current === threadId) closeThread();
    await refreshThreads();
  }, [closeThread, refreshThreads, rpc]);

  const toggleArchived = useCallback(async () => {
    closeThread();
    archivedRef.current = !archivedRef.current;
    setShowArchived(archivedRef.current);
    setThreads([]);
    await listRefreshRef.current?.catch(() => undefined);
    await refreshThreads();
  }, [closeThread, refreshThreads]);

  const refreshActiveHistory = useCallback(() => {
    const threadId = activeThreadRef.current;
    if (!threadId || historyRefreshRef.current) return;
    historyRefreshRef.current = openThread(threadId, { silent: true, preserveHistory: true })
      .catch(() => undefined)
      .finally(() => { historyRefreshRef.current = null; });
  }, [openThread]);

  const steerTurn = useCallback(
    async (threadId: string, turnId: string, text: string, attachments: ComposerAttachment[] = []) => {
      await rpc('turn/steer', { threadId, expectedTurnId: turnId, input: [
        ...(text.trim() ? [{ type: 'text', text, text_elements: [] }] : []),
        ...attachments.map((attachment) => ({ type: 'image', url: attachment.url }))
      ] });
    },
    [rpc]
  );

  const interruptTurn = useCallback(
    async (threadId: string, turnId: string) => {
      await rpc('turn/interrupt', { threadId, turnId });
    },
    [rpc]
  );

  const scheduleThreadRefresh = useCallback(() => {
    if (refreshThreadsTimerRef.current) window.clearTimeout(refreshThreadsTimerRef.current);
    refreshThreadsTimerRef.current = window.setTimeout(() => {
      refreshThreadsTimerRef.current = null;
      void refreshThreads().catch(() => undefined);
    }, 400);
  }, [refreshThreads]);

  const rejectPendingServerResponses = useCallback((error: Error) => {
    for (const pending of pendingServerResponsesRef.current.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    pendingServerResponsesRef.current.clear();
  }, []);

  const respondToRequest = useCallback((request: ServerRequest, result: unknown): Promise<void> => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Remote connection is not ready.'));
    }

    const key = requestKey(request.requestId);
    const existing = pendingServerResponsesRef.current.get(key);
    if (existing) {
      window.clearTimeout(existing.timeout);
      existing.reject(new Error('A newer approval response replaced this request.'));
      pendingServerResponsesRef.current.delete(key);
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingServerResponsesRef.current.delete(key);
        reject(new Error('Approval response was not acknowledged.'));
      }, 10_000);
      pendingServerResponsesRef.current.set(key, { resolve, reject, timeout });
      try {
        socket.send(
          JSON.stringify({
            type: 'server.request.respond',
            requestId: request.requestId,
            result
          })
        );
      } catch (error) {
        window.clearTimeout(timeout);
        pendingServerResponsesRef.current.delete(key);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    if (!authenticated) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new RemoteConnection({
      url: `${protocol}//${window.location.host}/ws`,
      onSocket: (socket) => { socketRef.current = socket; },
      onOpen: () => {
        setConnected(true);
        setLastError(null);
        watchThread(activeThreadRef.current);
        void Promise.allSettled([
          refreshThreads(),
          rpc<{ data: ModelInfo[] }>('model/list', { limit: 100, includeHidden: false }).then((result) =>
            setModels(result.data ?? [])
          ),
          refreshProjects()
        ]);
        const threadId = activeThreadRef.current;
        if (threadId) void openThread(threadId, { silent: true, preserveHistory: true }).catch(() => undefined);
      },
      onMessage: handleMessage,
      onDisconnect: (error) => {
        setConnected(false);
        setLastError(error.message);
        flushStreamingDeltas();
        for (const pending of pendingRef.current.values()) {
          window.clearTimeout(pending.timer);
          pending.reject(error);
        }
        pendingRef.current.clear();
        rejectPendingServerResponses(error);
      }
    });
    connection.start();
    return () => {
      disposedRef.current = true;
      if (refreshThreadsTimerRef.current) window.clearTimeout(refreshThreadsTimerRef.current);
      clearStreamingDeltas();
      connection.dispose();
      for (const pending of pendingRef.current.values()) {
        window.clearTimeout(pending.timer);
        pending.reject(new Error('Remote connection closed.'));
      }
      pendingRef.current.clear();
      rejectPendingServerResponses(new Error('Remote connection closed.'));
    };
  }, [authenticated, clearStreamingDeltas, flushStreamingDeltas, openThread, refreshProjects, refreshThreads, rejectPendingServerResponses, rpc, watchThread]);

  useEffect(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'thread.watch', threadId: activeThreadId }));
    }
  }, [activeThreadId, connected]);

  useEffect(() => {
    if (!authenticated || !connected) return;
    const recover = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshThreads().catch(() => undefined);
      refreshActiveHistory();
    };
    const timer = window.setInterval(recover, 30_000);
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [authenticated, connected, refreshActiveHistory, refreshThreads]);

  function handleMessage(message: ServerMessage): void {
    if (message.type === 'rpc.result') {
      const pending = pendingRef.current.get(message.id);
      if (pending) {
        window.clearTimeout(pending.timer);
        pendingRef.current.delete(message.id);
        pending.resolve(message.result);
      }
      return;
    }

    if (message.type === 'rpc.error') {
      const pending = pendingRef.current.get(message.id);
      if (pending) {
        window.clearTimeout(pending.timer);
        pendingRef.current.delete(message.id);
        pending.reject(new Error(message.error.message));
      }
      return;
    }

    if (message.type === 'bridge.status') {
      setBridgeStatus({ status: message.status, ...(message.message ? { message: message.message } : {}) });
      return;
    }

    if (message.type === 'server.request.snapshot') {
      setServerRequests(
        message.requests.map((request) => ({
          requestId: request.requestId,
          method: request.method,
          params: request.params as Record<string, unknown>
        }))
      );
      return;
    }

    if (message.type === 'server.request') {
      setServerRequests((current) => [
        ...current.filter((entry) => requestKey(entry.requestId) !== requestKey(message.requestId)),
        { requestId: message.requestId, method: message.method, params: message.params as Record<string, unknown> }
      ]);
      return;
    }

    if (message.type === 'server.request.resolved') {
      const key = requestKey(message.requestId);
      const pending = pendingServerResponsesRef.current.get(key);
      if (pending) {
        window.clearTimeout(pending.timeout);
        pending.resolve();
        pendingServerResponsesRef.current.delete(key);
      }
      setServerRequests((current) => current.filter((entry) => requestKey(entry.requestId) !== key));
      return;
    }

    if (message.type === 'server.request.failed') {
      const key = requestKey(message.requestId);
      const pending = pendingServerResponsesRef.current.get(key);
      if (pending) {
        window.clearTimeout(pending.timeout);
        pending.reject(new Error(message.error.message));
        pendingServerResponsesRef.current.delete(key);
      }
      setLastError(message.error.message);
      return;
    }

    if (message.type === 'event') {
      handleCodexEvent(message.method, message.params as Record<string, unknown>);
      return;
    }

    if (message.type === 'error') {
      setLastError(message.error.message);
    }
  }

  function handleCodexEvent(method: string, params: Record<string, unknown>): void {
    if (method === 'thread/tokenUsage/updated') {
      const threadId = String(params.threadId ?? '');
      const usage = params.tokenUsage as ContextUsage | undefined;
      if (threadId && usage) setTokenUsage((current) => ({ ...current, [threadId]: usage }));
    } else if (method.startsWith('thread/')) {
      scheduleThreadRefresh();
    }
    if (method === 'remote/connected') {
      scheduleThreadRefresh();
      refreshActiveHistory();
    }
    if (method === 'thread/started') {
      const thread = params.thread as Thread | undefined;
      if (thread && !archivedRef.current) setThreads((current) => dedupeThreads([...current, thread]));
    }

    if (method.startsWith('project/')) {
      void refreshProjects().catch(() => undefined);
      scheduleThreadRefresh();
    }

    if (method === 'thread/status/changed') {
      const threadId = String(params.threadId ?? '');
      const status = params.status as Thread['status'] | undefined;
      if (threadId && status) {
        setThreads((current) => current.map((thread) => (thread.id === threadId ? { ...thread, status } : thread)));
        setActiveThread((current) => (current?.id === threadId ? { ...current, status } : current));
        if (threadId === activeThreadRef.current && status.type !== 'active') {
          turnRevisionRef.current += 1;
          activeTurnIdRef.current = null;
          setActiveTurnId(null);
        }
      }
    }

    if (method === 'thread/name/updated') {
      const threadId = String(params.threadId ?? '');
      const name = typeof params.threadName === 'string' ? params.threadName : typeof params.name === 'string' ? params.name : null;
      if (threadId) {
        setThreads((current) => current.map((thread) => (thread.id === threadId ? { ...thread, name } : thread)));
        setActiveThread((current) => (current?.id === threadId ? { ...current, name } : current));
      }
    }

    if (method === 'thread/settings/updated') {
      const threadId = String(params.threadId ?? '');
      const settings = params.threadSettings as
        | ({ model?: string; effort?: string | null } & PermissionSettings)
        | undefined;
      if (threadId && settings) {
        setThreads((current) =>
          current.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  ...(settings.model ? { model: settings.model } : {}),
                  ...(settings.effort ? { reasoningEffort: settings.effort } : {}),
                  permissionProfile: permissionProfileId(settings)
                }
              : thread
          )
        );
        setActiveThread((current) =>
          current?.id === threadId
            ? {
                ...current,
                ...(settings.model ? { model: settings.model } : {}),
                ...(settings.effort ? { reasoningEffort: settings.effort } : {}),
                permissionProfile: permissionProfileId(settings)
              }
            : current
        );
      }
    }

    if (method === 'thread/project/updated') {
      const threadId = String(params.threadId ?? '');
      const projectId =
        typeof params.projectId === 'string' ? params.projectId : null;
      if (threadId) {
        setThreads((current) => current.map((thread) => (thread.id === threadId ? { ...thread, projectId } : thread)));
        setActiveThread((current) => (current?.id === threadId ? { ...current, projectId } : current));
      }
    }

    if (method === 'thread/archived' || method === 'thread/deleted') {
      const threadId = String(params.threadId ?? '');
      if (threadId) {
        setThreads((current) => current.filter((thread) => thread.id !== threadId));
        if (threadId === activeThreadRef.current) closeThread();
      }
    }

    if (method === 'serverRequest/resolved') {
      const requestId = params.requestId as string | number | undefined;
      if (requestId !== undefined) {
        const key = requestKey(requestId);
        setServerRequests((current) => current.filter((entry) => requestKey(entry.requestId) !== key));
      }
    }

    if (method === 'item/started' && params.threadId === activeThreadRef.current) {
      const item = params.item as ThreadItem | undefined;
      if (item?.id) {
        setItems((current) => upsertItem(current, { ...item, turnId: String(params.turnId ?? '') }));
      }
    }

    if (method === 'turn/started' && params.threadId === activeThreadRef.current) {
      const turn = params.turn as { id?: string } | undefined;
      if (turn?.id) {
        turnRevisionRef.current += 1;
        activeTurnIdRef.current = turn.id;
        setActiveTurnId(turn.id);
      }
    }

    if (method === 'item/completed' && params.threadId === activeThreadRef.current) {
      const item = params.item as ThreadItem | undefined;
      if (item?.id) {
        flushStreamingDeltas();
        setItems((current) => upsertItem(current, { ...item, turnId: String(params.turnId ?? '') }));
      }
    }

    if (method === 'item/agentMessage/delta' && params.threadId === activeThreadRef.current) {
      const itemId = String(params.itemId ?? '');
      const delta = String(params.delta ?? '');
      if (itemId && delta) queueStreamingDelta('agent', itemId, delta, String(params.turnId ?? ''));
    }

    if (method === 'item/commandExecution/outputDelta' && params.threadId === activeThreadRef.current) {
      const itemId = String(params.itemId ?? '');
      const delta = String(params.delta ?? '');
      if (itemId && delta) queueStreamingDelta('command', itemId, delta, String(params.turnId ?? ''));
    }

    if (method === 'turn/completed') {
      const threadId = String(params.threadId ?? '');
      if (threadId === activeThreadRef.current) {
        flushStreamingDeltas();
        turnRevisionRef.current += 1;
        activeTurnIdRef.current = null;
        setActiveTurnId(null);
        refreshActiveHistory();
      }
      scheduleThreadRefresh();
    }
  }

  const status = useMemo(() => {
    if (!authenticated) return 'authenticated' as const;
    if (!connected) return 'disconnected' as const;
    if (bridgeStatus.status === 'ready') return 'ready' as const;
    return bridgeStatus.status;
  }, [authenticated, bridgeStatus.status, connected]);

  return {
    connected,
    status,
    bridgeStatus,
    threads,
    threadsLoading,
    models,
    permissionProfiles,
    defaultPermissionProfile,
    refreshPermissions,
    projects,
    activeThreadId,
    activeTurnId,
    activeThread,
    items,
    contextUsage: activeThreadId ? tokenUsage[activeThreadId] : undefined,
    hasMoreHistory,
    loadingHistory,
    serverRequests,
    loadingThread,
    showArchived,
    lastError,
    refreshThreads,
    refreshProjects,
    openThread,
    loadEarlierHistory,
    closeThread,
    createThread,
    sendTurn,
    setThreadSettings,
    renameThread,
    archiveThread,
    toggleArchived,
    steerTurn,
    interruptTurn,
    respondToRequest,
    setLastError
  };
}

export type RemoteState = ReturnType<typeof useRemote>;

function requestKey(requestId: string | number): string {
  return String(requestId);
}
