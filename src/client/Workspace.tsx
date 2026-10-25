import {
  CircleAlert,
  Menu,
  PanelRight,
  PanelLeft,
  PanelBottom,
  Info,
  MoreHorizontal,
  Pencil,
  Archive,
  ArchiveRestore,
  Check,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from './api';
import { ApprovalDock } from './components/ApprovalDock';
import { Composer } from './components/Composer';
import { Inspector } from './components/Inspector';
import { Sidebar } from './components/Sidebar';
import { ThreadTimeline } from './components/ThreadTimeline';
import { CommandPanel } from './components/CommandPanel';
import { displayThreadTitle } from './remote-state';
import { useRemote } from './useRemote';
import type { ComposerAttachment, Thread } from './types';
import { resolveReasoningEffort } from './workspace-model';

interface WorkspaceProps {
  onAuthExpired: () => void;
}

type LayoutMode = 'desktop' | 'mobile';

export function Workspace({ onAuthExpired }: WorkspaceProps) {
  const remote = useRemote({ authenticated: true, onAuthExpired });
  const layout = useResponsiveLayout();
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorView, setInspectorView] = useState<'changes' | 'activity' | 'files'>('changes');
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [newTaskModel, setNewTaskModel] = useState('');
  const [newTaskEffort, setNewTaskEffort] = useState('');
  const [newTaskPermissions, setNewTaskPermissions] = useState('');
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  const activeThread = remote.activeThread;
  const defaultModel = remote.models.find((model) => model.isDefault) ?? remote.models[0];
  const activeModelInfo =
    remote.models.find((model) => model.model === (activeThread?.model || newTaskModel)) ?? defaultModel;
  const activeEffort = resolveReasoningEffort(
    activeModelInfo,
    activeThread?.reasoningEffort || newTaskEffort
  );
  const effectiveModel = activeThread?.model || newTaskModel || defaultModel?.model || '';
  const effectivePermissions = activeThread?.permissionProfile || newTaskPermissions || remote.defaultPermissionProfile || '';
  const permissionCwd = activeThread?.cwd || remote.projects.find((project) => project.id === selectedProjectId)?.roots[0]?.path;

  useEffect(() => {
    if (remote.connected) {
      void remote.refreshPermissions(permissionCwd).catch((error: Error) => remote.setLastError(error.message));
    }
  }, [remote.connected, remote.refreshPermissions, permissionCwd]);

  useEffect(() => {
    if (!newTaskModel && defaultModel) setNewTaskModel(defaultModel.model);
  }, [defaultModel, newTaskModel]);

  useEffect(() => {
    if (!newTaskEffort && defaultModel) {
      setNewTaskEffort(resolveReasoningEffort(defaultModel, defaultModel.defaultReasoningEffort));
    }
  }, [defaultModel, newTaskEffort]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['n', 'k'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        beginNewTask();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        if (layout === 'mobile') setSidebarOpen((value) => !value);
        else setSidebarCollapsed((value) => !value);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault(); setCommandsOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        setInspectorOpen(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [layout, remote.showArchived, remote.closeThread, remote.toggleArchived]);

  const showError = (error: unknown) => {
    remote.setLastError(error instanceof Error ? error.message : String(error));
  };

  function beginNewTask(projectId?: string) {
    remote.closeThread();
    if (remote.showArchived) void remote.toggleArchived().catch(showError);
    remote.setLastError(null);
    if (projectId !== undefined) setSelectedProjectId(projectId);
    setSidebarOpen(false);
    setComposerFocusRequest((value) => value + 1);
  }

  async function selectThread(threadId: string) {
    setSidebarOpen(false);
    setInspectorOpen(false);
    setTaskMenuOpen(false);
    setRenameDraft(null);
    await remote.openThread(threadId).catch(showError);
  }

  async function changeModel(model: string) {
    const info = remote.models.find((entry) => entry.model === model);
    if (!activeThread) {
      setNewTaskModel(model);
      setNewTaskEffort(resolveReasoningEffort(info, newTaskEffort));
      return;
    }
    try {
      await remote.setThreadSettings(activeThread.id, {
        model,
        effort: resolveReasoningEffort(info, activeThread.reasoningEffort)
      });
    } catch (error) {
      showError(error);
    }
  }

  async function changeEffort(effort: string) {
    if (!activeThread) {
      setNewTaskEffort(effort);
      return;
    }
    try {
      await remote.setThreadSettings(activeThread.id, { effort });
    } catch (error) {
      showError(error);
    }
  }

  async function changePermissions(permissions: string) {
    if (!activeThread) {
      setNewTaskPermissions(permissions);
      return;
    }
    await remote.setThreadSettings(activeThread.id, { permissions });
  }

  async function submitHome(text: string, attachments: ComposerAttachment[]) {
    const project = remote.projects.find((entry) => entry.id === selectedProjectId);
    const thread = await remote.createThread({
      ...(project?.roots?.[0]?.path ? { cwd: project.roots[0].path } : {}),
      ...(project?.id ? { projectId: project.id } : {}),
      ...(newTaskModel ? { model: newTaskModel } : {}),
      ...(newTaskEffort ? { effort: newTaskEffort } : {}),
      ...(effectivePermissions ? { permissions: effectivePermissions } : {})
    });
    await remote.sendTurn(thread.id, text, {
      ...(newTaskModel ? { model: newTaskModel } : {}),
      ...(newTaskEffort ? { effort: newTaskEffort } : {})
    }, attachments);
  }

  async function submitThread(text: string, attachments: ComposerAttachment[]) {
    if (!activeThread) return;
    if (remote.activeTurnId) {
      await remote.steerTurn(activeThread.id, remote.activeTurnId, text, attachments);
      return;
    }
    await remote.sendTurn(activeThread.id, text, {
      ...(effectiveModel ? { model: effectiveModel } : {}),
      ...(activeEffort ? { effort: activeEffort } : {})
    }, attachments);
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      onAuthExpired();
    }
  }

  const title = activeThread ? displayThreadTitle(activeThread) : '新任务';

  return (
    <div className="app-shell" data-layout={layout}>
      <Sidebar
        remote={remote}
        activeThreadId={remote.activeThreadId}
        layout={layout}
        open={sidebarOpen}
        collapsed={sidebarCollapsed}
        search={search}
        onSearchChange={setSearch}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        onNewTask={beginNewTask}
        onSelectThread={(threadId) => void selectThread(threadId)}
        onLogout={() => void logout()}
      />

      {layout === 'mobile' && sidebarOpen && (
        <button type="button" className="mobile-backdrop" aria-label="关闭侧边栏" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="workspace-main" id="main-content">
        <header className={`workspace-header${activeThread ? '' : ' workspace-header--home'}`}>
          <div className="workspace-header-start">
            {layout === 'mobile' && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setSidebarOpen((value) => !value)}
                aria-label="打开任务列表"
              >
                <Menu size={18} />
              </button>
            )}
            {activeThread && (
              <button
                type="button"
                className="workspace-title"
                onClick={() => { setTaskMenuOpen((value) => !value); setRenameDraft(null); }}
                aria-label={`任务操作：${title}`}
                title={activeThread.cwd}
              >
                <strong>{title}</strong>
                <span className="workspace-path">{activeThread.cwd}</span>
              </button>
            )}
            {!activeThread && <div className="workspace-title"><strong>{title}</strong>
              <span className="workspace-path">{permissionCwd}</span></div>}
          </div>
          <div className="workspace-header-actions">
            {activeThread && (
              <div className="task-menu-anchor">
                <button type="button" className="icon-button" aria-label="任务操作" title="任务操作"
                  aria-expanded={taskMenuOpen} onClick={() => { setTaskMenuOpen((value) => !value); setRenameDraft(null); }}>
                  <MoreHorizontal size={19} />
                </button>
                {taskMenuOpen && (
                  <>
                    <button type="button" className="task-menu-dismiss" aria-label="关闭任务菜单" onClick={() => setTaskMenuOpen(false)} />
                    <div className="task-menu">
                      {renameDraft !== null ? (
                        <form onSubmit={(event) => {
                          event.preventDefault();
                          const name = renameDraft.trim();
                          if (!name) return;
                          void remote.renameThread(activeThread.id, name).then(() => { setTaskMenuOpen(false); setRenameDraft(null); }).catch(showError);
                        }}>
                          <input aria-label="任务名称" value={renameDraft} autoFocus onChange={(event) => setRenameDraft(event.target.value)} />
                          <button type="submit" className="icon-button" aria-label="保存任务名称"><Check size={16} /></button>
                        </form>
                      ) : (
                        <button type="button" onClick={() => setRenameDraft(displayThreadTitle(activeThread))}><Pencil size={15} />重命名</button>
                      )}
                      <button type="button" onClick={() => {
                        setTaskMenuOpen(false);
                        void remote.archiveThread(activeThread.id, !remote.showArchived).catch(showError);
                      }}>
                        {remote.showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                        {remote.showArchived ? '取消归档' : '归档任务'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {layout === 'desktop' && <button type="button" className="icon-button" aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              title="切换侧边栏" aria-pressed={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((value) => !value)}><PanelLeft size={16} /></button>}
            <button type="button" className="icon-button" aria-label="命令记录" title="命令记录"
              aria-pressed={commandsOpen} onClick={() => setCommandsOpen((value) => !value)}><PanelBottom size={16} /></button>
            <button type="button" className="icon-button" aria-label="任务信息" title="任务信息"
              aria-pressed={inspectorOpen && inspectorView === 'files'} onClick={() => {
                setInspectorView('files'); setInspectorOpen((value) => inspectorView === 'files' ? !value : true);
              }}><Info size={16} /></button>
            <button
              type="button"
              className={`icon-button${inspectorOpen ? ' is-active' : ''}`}
              onClick={() => { setInspectorView('changes'); setInspectorOpen((value) => inspectorView === 'changes' ? !value : true); }}
              aria-label="打开任务检查器"
              title="打开任务检查器"
              aria-pressed={inspectorOpen}
            >
              <PanelRight size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        {remote.lastError && (
          <div className="error-banner" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{remote.lastError}</span>
            <button type="button" onClick={() => remote.setLastError(null)} aria-label="关闭错误提示">
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}

        {activeThread ? (
          <ThreadScreen
            key={activeThread.id}
            remote={remote}
            thread={activeThread}
            layout={layout}
            model={effectiveModel}
            effort={activeEffort}
            permissions={effectivePermissions}
            onPermissionsChange={changePermissions}
            onModelChange={changeModel}
            onEffortChange={changeEffort}
            onSubmit={submitThread}
            onError={showError}
          />
        ) : (
          <HomeView
            remote={remote}
            layout={layout}
            selectedProjectId={selectedProjectId}
            model={newTaskModel}
            effort={newTaskEffort}
            permissions={effectivePermissions}
            onPermissionsChange={changePermissions}
            focusRequest={composerFocusRequest}
            onProjectChange={(projectId) => {
              setSelectedProjectId(projectId);
              setNewTaskPermissions('');
              setComposerFocusRequest((value) => value + 1);
            }}
            onModelChange={changeModel}
            onEffortChange={changeEffort}
            onSubmit={submitHome}
            onError={showError}
          />
        )}
        {commandsOpen && <CommandPanel items={remote.items} onClose={() => setCommandsOpen(false)} />}
      </main>

      <Inspector
        key={activeThread?.id ?? 'home'}
        open={inspectorOpen}
        view={inspectorView}
        layout={layout}
        thread={activeThread}
        items={remote.items}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
}

function HomeView({
  remote,
  layout,
  selectedProjectId,
  model,
  effort,
  permissions,
  onPermissionsChange,
  focusRequest,
  onProjectChange,
  onModelChange,
  onEffortChange,
  onSubmit,
  onError
}: {
  remote: ReturnType<typeof useRemote>;
  layout: LayoutMode;
  selectedProjectId: string;
  model: string;
  effort: string;
  permissions: string;
  onPermissionsChange: (permissions: string) => Promise<void>;
  focusRequest: number;
  onProjectChange: (projectId: string) => void;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: string) => void;
  onSubmit: (text: string, attachments: ComposerAttachment[]) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  return (
    <div className={`home-view home-view--${layout}`}>
      <div className="home-hero">
        <div className="home-symbol" aria-hidden="true">
          <img src="/codex-mark.svg" width={48} height={48} alt="" />
        </div>
        <h1>{selectedProjectId ? `在 ${remote.projects.find((project) => project.id === selectedProjectId)?.name ?? '项目'} 中需要什么帮助？` : '有什么可以帮忙？'}</h1>
      </div>
      <div className="home-composer-dock">
        <Composer
          variant="home"
          disabled={!remote.connected}
          layout={layout}
          model={model}
          effort={effort}
          permissions={permissions}
          permissionProfiles={remote.permissionProfiles}
          onPermissionsChange={onPermissionsChange}
          models={remote.models}
          projects={remote.projects}
          selectedProjectId={selectedProjectId}
          focusRequest={focusRequest}
          onProjectChange={onProjectChange}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
          onSubmit={onSubmit}
          onError={onError}
        />
      </div>
    </div>
  );
}

function ThreadScreen({
  remote,
  thread,
  layout,
  model,
  effort,
  permissions,
  onPermissionsChange,
  onModelChange,
  onEffortChange,
  onSubmit,
  onError
}: {
  remote: ReturnType<typeof useRemote>;
  thread: Thread;
  layout: LayoutMode;
  model: string;
  effort: string;
  permissions: string;
  onPermissionsChange: (permissions: string) => Promise<void>;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: string) => void;
  onSubmit: (text: string, attachments: ComposerAttachment[]) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  return (
    <div className="thread-screen">
      <ThreadTimeline
        key={thread.id}
        threadId={thread.id}
        items={remote.items}
        loading={remote.loadingThread}
        running={Boolean(remote.activeTurnId)}
        hasMoreHistory={remote.hasMoreHistory}
        loadingHistory={remote.loadingHistory}
        onLoadEarlier={remote.loadEarlierHistory}
      />

      <div className="thread-bottom">
        <ApprovalDock
          requests={remote.serverRequests.filter((request) => request.params.threadId === thread.id)}
          onRespond={remote.respondToRequest}
          onError={onError}
        />
        <Composer
          variant="thread"
          draftKey={thread.id}
          disabled={!remote.connected || remote.loadingThread || remote.showArchived}
          layout={layout}
          model={model}
          effort={effort}
          permissions={permissions}
          permissionProfiles={remote.permissionProfiles}
          onPermissionsChange={onPermissionsChange}
          models={remote.models}
          activeTurnId={remote.activeTurnId}
          {...(remote.contextUsage ? { contextUsage: remote.contextUsage } : {})}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
          onSubmit={onSubmit}
          {...(remote.activeTurnId
            ? { onStop: () => remote.interruptTurn(thread.id, remote.activeTurnId!) }
            : {})}
          onError={onError}
        />
      </div>
    </div>
  );
}

function useResponsiveLayout(): LayoutMode {
  const getLayout = (): LayoutMode => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width < 720 || (width < 980 && width / height < 1.18)) return 'mobile';
    return 'desktop';
  };
  const [layout, setLayout] = useState<LayoutMode>(getLayout);

  useEffect(() => {
    const update = () => setLayout(getLayout());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return layout;
}
