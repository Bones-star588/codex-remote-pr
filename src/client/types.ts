export interface ThreadStatus {
  type: 'notLoaded' | 'idle' | 'systemError' | 'active';
  activeFlags?: Array<{ type: string }>;
}

export interface Thread {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  projectId: string | null;
  model: string | null;
  modelProvider: string;
  reasoningEffort: string | null;
  createdAt: number;
  updatedAt: number;
  status: ThreadStatus;
  source?: unknown;
  archived?: boolean;
  permissionProfile?: string | null;
  collaborationMode?: CollaborationMode | null;
  gitInfo?: { branch?: string | null; sha?: string | null; originUrl?: string | null } | null;
  turns?: Turn[];
}

export interface Turn {
  id: string;
  status: 'completed' | 'interrupted' | 'failed' | 'inProgress';
  items: ThreadItem[];
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error?: { message?: string } | null;
}

export type ThreadItem = (
  | { type: 'userMessage'; id: string; content: Array<{ type: string; text?: string; path?: string; url?: string }> }
  | { type: 'agentMessage'; id: string; text: string; phase?: 'commentary' | 'partial_answer' | 'final_answer' | null }
  | { type: 'reasoning'; id: string; summary: string[]; content: string[] }
  | {
      type: 'commandExecution';
      id: string;
      command: string;
      cwd: string;
      status: 'inProgress' | 'completed' | 'failed' | 'declined';
      aggregatedOutput: string | null;
      exitCode: number | null;
      durationMs: number | null;
    }
  | { type: 'fileChange'; id: string; status: 'inProgress' | 'completed' | 'failed' | 'declined'; changes: FileChange[] }
  | { type: 'plan'; id: string; text: string }
  | { type: 'mcpToolCall'; id: string; server: string; tool: string; status: string; arguments: unknown; result: unknown; error: unknown }
  | { type: 'dynamicToolCall'; id: string; tool: string; status: string; arguments: unknown; contentItems: unknown }
  | { type: 'webSearch'; id: string; query?: string }
  | { type: 'imageView'; id: string; path: string }
  | { type: 'imageGeneration'; id: string }
  | { type: 'contextCompaction'; id: string }
) & { turnId?: string; startedAtMs?: number | null; completedAtMs?: number | null };

export interface FileChange {
  path: string;
  diff?: string;
  kind?: string | { type: string; move_path?: string | null };
}

export interface ComposerAttachment {
  id: string;
  name: string;
  url: string;
}

export interface CollaborationMode {
  mode: 'default' | 'plan';
  settings: { model: string; reasoning_effort: string | null; developer_instructions: string | null };
}

export interface SkillInfo {
  name: string;
  path: string;
  description: string;
  shortDescription?: string;
  enabled: boolean;
  interface?: { displayName?: string; shortDescription?: string };
}

export interface SkillsResult {
  skills: SkillInfo[];
  errors: Array<{ path: string; message: string }>;
}

export type ReviewTarget =
  | { type: 'uncommittedChanges' }
  | { type: 'baseBranch'; branch: string }
  | { type: 'commit'; sha: string; title: string | null }
  | { type: 'custom'; instructions: string };

export interface McpStatus {
  name: string;
  authStatus: string;
  runtimeStatus?: string | null;
  tools: Record<string, unknown>;
  toolsError?: string | null;
}

export interface ContextUsage {
  last: { totalTokens: number };
  modelContextWindow?: number | null;
}

export interface ThreadHistoryItemEntry {
  turnId: string;
  item: ThreadItem;
  startedAtMs: number | null;
  completedAtMs: number | null;
}

export interface ThreadHistoryPage {
  items: ThreadHistoryItemEntry[];
  nextCursor: string | null;
  activeTurnId: string | null;
}

export interface ModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  hidden: boolean;
  supportedReasoningEfforts?: Array<{ reasoningEffort: string; description?: string }>;
  defaultReasoningEffort?: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  roots: Array<{ path: string }>;
  position?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface WorkspaceBootstrap {
  threads: { data: Thread[]; nextCursor: string | null } | null;
  models: { data: ModelInfo[] } | null;
  projects: { data: ProjectInfo[] } | null;
}

export interface ServerRequest {
  requestId: string | number;
  method: string;
  params: Record<string, unknown>;
}

export interface BridgeStatus {
  status: 'starting' | 'ready' | 'restarting' | 'offline';
  message?: string;
}

export interface DesktopWindowStatus {
  available: boolean;
  title: string | null;
  url: string | null;
  composerFound: boolean;
  composerText: string;
}
