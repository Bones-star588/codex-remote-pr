export type ClientRpcMethod =
  | 'thread/list'
  | 'thread/read'
  | 'thread/start'
  | 'thread/resume'
  | 'thread/turns/list'
  | 'thread/items/list'
  | 'thread/name/set'
  | 'thread/archive'
  | 'thread/unarchive'
  | 'thread/settings/update'
  | 'turn/start'
  | 'turn/steer'
  | 'turn/interrupt'
  | 'model/list'
  | 'permissionProfile/list'
  | 'project/list'
  | 'project/read'
  | 'getAuthStatus'
  | 'account/read'
  | 'account/rateLimits/read'
  | 'config/read'
  | 'mcpServerStatus/list'
  | 'fs/readFile'
  | 'fs/readDirectory'
  | 'fs/getMetadata'
  | 'gitDiffToRemote'
  | 'getConversationSummary';

export type ClientMessage =
  | { type: 'rpc'; id: string; method: ClientRpcMethod; params?: unknown }
  | { type: 'server.request.respond'; requestId: string | number; result?: unknown; error?: unknown }
  | { type: 'thread.watch'; threadId: string | null }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'hello'; connectedAt: string; codexAvailable: boolean; binary: string }
  | { type: 'rpc.result'; id: string; result: unknown }
  | { type: 'rpc.error'; id: string; error: { code?: number; message: string; data?: unknown } }
  | { type: 'event'; method: string; params: unknown }
  | { type: 'server.request.snapshot'; requests: Array<{ requestId: string | number; method: string; params: unknown }> }
  | { type: 'server.request'; requestId: string | number; method: string; params: unknown }
  | { type: 'server.request.resolved'; requestId: string | number }
  | { type: 'server.request.failed'; requestId: string | number; error: { message: string } }
  | { type: 'bridge.status'; status: 'starting' | 'ready' | 'restarting' | 'offline'; message?: string }
  | { type: 'pong'; at: string }
  | { type: 'error'; error: { message: string } };

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
}
