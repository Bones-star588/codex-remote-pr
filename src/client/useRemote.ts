import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ClientRpcMethod, ServerMessage } from '../shared/protocol';
import type { TurnTiming } from '../shared/turn-timing';
import { permissionProfileId, permissionProfileUpdate, type PermissionProfile, type PermissionSettings } from '../shared/permissions';
import { api } from './api';
import { RemoteConnection } from './remote-connection';
import { itemKey, mergeLatestHistoryItems, mergeOlderHistoryItems, mergeTurnTimings, upsertItem } from './remote-state';
import type {
  BridgeStatus,
  ModelInfo,
  ProjectInfo,
  ServerRequest,
  Thread,
  ThreadHistoryPage,
  ThreadItem
} from './types';
import type { WorkspaceBootstrap } from './types';
import type { CollaborationMode, ComposerAttachment, ContextUsage, McpStatus, ReviewTarget, SkillInfo, SkillsResult } from './types';
import { turnInput } from './slash-commands';
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
  bootstrap: WorkspaceBootstrap | null;
}

export interface ThreadSettingsPatch {
  model?: string;
  effort?: string;
  permissions?: string;
  collaborationMode?: CollaborationMode;
}

export interface CreateThreadOptions {
  cwd?: string;
  projectId?: string;
  model?: string;
  effort?: string;
  permissions?: string;
  collaborationMode?: CollaborationMode;
}

export function useRemote({ authenticated, onAuthExpired, bootstrap }: UseRemoteOptions) {
  const [connected, setConnected] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ status: 'offline' });
  const [threads, setThreads] = useState<Thread[]>(() => dedupeThreads(bootstrap?.threads?.data ?? []));
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>(bootstrap?.models?.data ?? []);
  const [permissionProfiles, setPermissionProfiles] = useState<PermissionProfile[]>([]);
  const [defaultPermissionProfile, setDefaultPermissionProfile] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>(bootstrap?.projects?.data ?? []);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [turnTimings, setTurnTimings] = useState<Record<string, TurnTiming>>({});
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
  const turnsCursorRef = useRef<string | null>(null);
  const turnTimingsRef = useRef(turnTimings);
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
  const initialBootstrapRef = useRef(bootstrap);
  const historyCacheRef = useRef(new Map<string, ThreadHistoryPage>());
  const lastRecoveryRef = useRef(0);

  activeThreadRef.current = activeThreadId;
  threadsRef.current = threads;
  itemsRef.current = items;
  turnTimingsRef.current = turnTimings;
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

  const refreshThreads = useCallback((firstPage?: NonNullable<WorkspaceBootstrap['threads']>): Promise<Thread[]> => {
    if (listRefreshRef.current) return listRefreshRef.current;
    const archived = archivedRef.current;
    const request = (async () => {
    setThreadsLoading(true);
    try {
      const collected: Thread[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      while (true) {
        const result: { data: Thread[]; nextCursor: string | null } = firstPage && cursor === null ? firstPage : await rpc('thread/list', {
          limit: 200,
          sortKey: 'updated_at',
          sortDirection: 'desc',
          useStateDbOnly: true,
          modelProviders: [],
          archived,
          ...(cursor ? { cursor } : {})
        });
        collected.push(...(result.data ?? []).map((thread) => ({ ...thread, archived })));
        if (archived === archivedRef.current) {
          setThreads((current) => {
            const partial = dedupeThreads([...collected, ...current]);
            return JSON.stringify(current) === JSON.stringify(partial) ? current : partial;
          });
        }
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
    }
    })().finally(() => { listRefreshRef.current = null; });
    listRefreshRef.current = request;
    return request;
  }, [rpc]);

  const refreshProjects = useCallback(async () => {
    const result = await rpc<{ data: ProjectInfo[] }>('project/list', { limit: 200 });
    setProjects(result.data ?? []);
  }, [rpc]);

  const fetchHistoryPage = useCallback(async (threadId: string, before: string | null = null) => {
    const query = new URLSearchParams({ threadId, limit: before === null ? '40' : '100' });
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
      const cached = historyCacheRef.current.get(threadId);
      const cachedItems = cached ? cached.items.map((entry) => ({
        ...entry.item, turnId: entry.turnId,
        startedAtMs: entry.startedAtMs, completedAtMs: entry.completedAtMs
      })) : [];
      if (!options.silent) {
        selectionVersionRef.current += 1;
        activeThreadRef.current = threadId;
        watchThread(threadId);
        setActiveThreadId(threadId);
        setActiveThread(threadsRef.current.find((thread) => thread.id === threadId) ?? null);
        setItems(cachedItems);
        const timings = Object.fromEntries((cached?.turns ?? []).map((turn) => [turn.id, turn]));
        turnTimingsRef.current = timings;
        setTurnTimings(timings);
        turnsCursorRef.current = cached?.turnsCursor ?? null;
        olderHistoryCursorRef.current = null;
        setHasMoreHistory(false);
        setActiveTurnId(null);
        activeTurnIdRef.current = null;
      }
      const version = selectionVersionRef.current;
      const baseline = options.silent ? itemsRef.current : cachedItems;
      const timingBaseline = turnTimingsRef.current;
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
        const query = new URLSearchParams({
          threadId, mode: isNew ? 'new' : archived ? 'read' : 'resume'
        });
        const { result, ...page } = await api<ThreadHistoryPage & {
          result: { thread: Thread; collaborationMode?: CollaborationMode } & PermissionSettings;
        }>(`/api/thread/open?${query}`, { cache: 'no-store' });
        const thread = {
          ...result.thread, permissionProfile: permissionProfileId(result), archived: Boolean(archived),
          ...(result.collaborationMode ? { collaborationMode: result.collaborationMode } : {})
        };
        const historyItems = page.items.map((entry) => ({
          ...entry.item, turnId: entry.turnId,
          startedAtMs: entry.startedAtMs, completedAtMs: entry.completedAtMs
        }));
        if (version !== selectionVersionRef.current || activeThreadRef.current !== threadId) return;
        historyCacheRef.current.delete(threadId);
        historyCacheRef.current.set(threadId, page);
        if (historyCacheRef.current.size > 5) historyCacheRef.current.delete(historyCacheRef.current.keys().next().value!);
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
        setTurnTimings((current) => {
          const timings = mergeTurnTimings(current, page.turns, timingBaseline);
          turnTimingsRef.current = timings;
          return timings;
        });
        if (!options.preserveHistory) turnsCursorRef.current = page.turnsCursor;
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
    [clearStreamingDeltas, flushStreamingDeltas, watchThread]
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
      const missingTurns = new Set(olderItems.map((item) => item.turnId!).filter((id) => !turnTimingsRef.current[id]));
      const timings: TurnTiming[] = [];
      let turnsCursor = turnsCursorRef.current;
      while (missingTurns.size > 0 && turnsCursor !== null) {
        const result = await rpc<{ data: TurnTiming[]; nextCursor: string | null }>('thread/turns/list', {
          threadId, limit: 100, itemsView: 'notLoaded', cursor: turnsCursor
        });
        if (threadId !== activeThreadRef.current || version !== selectionVersionRef.current) return;
        timings.push(...result.data);
        result.data.forEach((turn) => missingTurns.delete(turn.id));
        if (result.nextCursor === turnsCursor) break;
        turnsCursor = result.nextCursor;
      }
      turnsCursorRef.current = turnsCursor;
      if (timings.length > 0) setTurnTimings((current) => {
        const next = { ...Object.fromEntries(timings.map((turn) => [turn.id, turn])), ...current };
        turnTimingsRef.current = next;
        return next;
      });
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
  }, [fetchHistoryPage, rpc]);

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
    setTurnTimings({});
    turnTimingsRef.current = {};
    turnsCursorRef.current = null;
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
      if (options.effort || options.collaborationMode) {
        await rpc('thread/settings/update', {
          threadId: thread.id,
          ...(options.effort ? { effort: options.effort } : {}),
          ...(options.collaborationMode ? { collaborationMode: options.collaborationMode } : {})
        });
        thread = {
          ...thread,
          ...(options.effort ? { reasoningEffort: options.effort } : {}),
          ...(options.collaborationMode ? { collaborationMode: options.collaborationMode } : {})
        };
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
      setTurnTimings({});
      turnTimingsRef.current = {};
      turnsCursorRef.current = null;
      setHasMoreHistory(false);
      setLoadingHistory(false);
      return thread;
    },
    [clearStreamingDeltas, rpc, watchThread]
  );

  const sendTurn = useCallback(
    async (threadId: string, text: string, settings: ThreadSettingsPatch = {}, attachments: ComposerAttachment[] = [], skills: SkillInfo[] = []) => {
      const clean = text.trim();
      if (!clean && attachments.length === 0 && skills.length === 0) return;

      if (!newThreadsRef.current.has(threadId)) await rpc('thread/resume', { threadId, excludeTurns: true });
      const result = await rpc<{ turn: TurnTiming }>('turn/start', {
        threadId,
        input: turnInput(clean, attachments, skills),
        ...(settings.model ? { model: settings.model } : {}),
        ...(settings.effort ? { effort: settings.effort } : {}),
        ...(settings.permissions ? permissionProfileUpdate(settings.permissions) : {}),
        ...(settings.collaborationMode ? { collaborationMode: settings.collaborationMode } : {})
      });
      newThreadsRef.current.delete(threadId);
      if (result.turn?.id && activeThreadRef.current === threadId) {
        turnRevisionRef.current += 1;
        activeTurnIdRef.current = result.turn.id;
        setActiveTurnId(result.turn.id);
        setTurnTimings((current) => ({ ...current, [result.turn.id]: result.turn }));
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
                ...(settings.permissions ? { permissionProfile: settings.permissions } : {}),
                ...(settings.collaborationMode ? { collaborationMode: settings.collaborationMode } : {})
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
              ...(settings.permissions ? { permissionProfile: settings.permissions } : {}),
              ...(settings.collaborationMode ? { collaborationMode: settings.collaborationMode } : {})
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

  const listSkills = useCallback(async (cwd?: string): Promise<SkillsResult> => {
    const result = await rpc<{ data: Array<{ skills: SkillInfo[]; errors: SkillsResult['errors'] }> }>(
      'skills/list', { ...(cwd ? { cwds: [cwd] } : {}) }
    );
    return {
      skills: [...new Map(result.data.flatMap((entry) => entry.skills).map((skill) => [skill.path, skill])).values()],
      errors: result.data.flatMap((entry) => entry.errors)
    };
  }, [rpc]);

  const listModes = useCallback(() => rpc<{ data: Array<{ mode: string | null }> }>('collaborationMode/list'), [rpc]);

  const listMcp = useCallback(async (threadId?: string) => {
    const data: McpStatus[] = [];
    let cursor: string | null = null;
    do {
      const page: { data: McpStatus[]; nextCursor?: string | null } = await rpc('mcpServerStatus/list', {
        limit: 100, detail: 'toolsAndAuthOnly', ...(cursor ? { cursor } : {}), ...(threadId ? { threadId } : {})
      });
      data.push(...page.data);
      cursor = page.nextCursor ?? null;
    } while (cursor);
    return data;
  }, [rpc]);

  const compactThread = useCallback(async (threadId: string) => {
    await rpc('thread/compact/start', { threadId });
  }, [rpc]);

  const reviewThread = useCallback(async (threadId: string, target: ReviewTarget) => {
    const result = await rpc<{ turn: { id: string } }>('review/start', { threadId, target, delivery: 'inline' });
    if (activeThreadRef.current === threadId && result.turn?.id) {
      turnRevisionRef.current += 1;
      activeTurnIdRef.current = result.turn.id;
      setActiveTurnId(result.turn.id);
    }
  }, [rpc]);

  const forkThread = useCallback(async (threadId: string) => {
    const result = await rpc<{ thread: Thread }>('thread/fork', { threadId, excludeTurns: true });
    setThreads((current) => dedupeThreads([...current, result.thread]));
    await openThread(result.thread.id);
    await refreshThreads();
  }, [rpc, openThread, refreshThreads]);

  const refreshActiveHistory = useCallback(() => {
    const threadId = activeThreadRef.current;
    if (!threadId || historyRefreshRef.current) return;
    historyRefreshRef.current = openThread(threadId, { silent: true, preserveHistory: true })
      .catch(() => undefined)
      .finally(() => { historyRefreshRef.current = null; });
  }, [openThread]);

  const steerTurn = useCallback(
    async (threadId: string, turnId: string, text: string, attachments: ComposerAttachment[] = [], skills: SkillInfo[] = []) => {
      await rpc('turn/steer', { threadId, expectedTurnId: turnId, input: turnInput(text, attachments, skills) });
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
        lastRecoveryRef.current = Date.now();
        setConnected(true);
        setLastError(null);
        watchThread(activeThreadRef.current);
        const initial = initialBootstrapRef.current;
        initialBootstrapRef.current = null;
        void Promise.allSettled([
          refreshThreads(initial?.threads ?? undefined),
          initial?.models ? Promise.resolve() : rpc<{ data: ModelInfo[] }>('model/list', { limit: 100, includeHidden: false }).then((result) =>
            setModels(result.data ?? [])
          ),
          initial?.projects ? Promise.resolve() : refreshProjects()
        ]);
        const threadId = activeThreadRef.current;
        if (threadId && !initial) void openThread(threadId, { silent: true, preserveHistory: true }).catch(() => undefined);
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
      if (Date.now() - lastRecoveryRef.current < 15_000) return;
      lastRecoveryRef.current = Date.now();
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
    if (method === 'thread/compacted' && params.threadId === activeThreadRef.current) refreshActiveHistory();
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
        | ({ model?: string; effort?: string | null; collaborationMode?: CollaborationMode } & PermissionSettings)
        | undefined;
      if (threadId && settings) {
        setThreads((current) =>
          current.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  ...(settings.model ? { model: settings.model } : {}),
                  ...(settings.effort ? { reasoningEffort: settings.effort } : {}),
                  ...(settings.collaborationMode ? { collaborationMode: settings.collaborationMode } : {}),
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
                ...(settings.collaborationMode ? { collaborationMode: settings.collaborationMode } : {}),
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
      const turn = params.turn as TurnTiming | undefined;
      if (turn?.id) {
        turnRevisionRef.current += 1;
        activeTurnIdRef.current = turn.id;
        setActiveTurnId(turn.id);
        setTurnTimings((current) => ({ ...current, [turn.id]: turn }));
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
        const turn = params.turn as TurnTiming | undefined;
        if (turn?.id) setTurnTimings((current) => ({ ...current, [turn.id]: turn }));
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
    turnTimings,
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
    isNewThread: activeThreadId ? newThreadsRef.current.has(activeThreadId) : false,
    listSkills,
    listModes,
    listMcp,
    compactThread,
    reviewThread,
    forkThread,
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
