import type { ClientRpcMethod } from '../shared/protocol';

export type ChatEventListener = (method: string, params: Record<string, unknown>) => void;

export interface ChatTransport {
  rpc: <T>(method: ClientRpcMethod, params?: unknown) => Promise<T>;
  subscribe: (listener: ChatEventListener) => () => void;
  watch: (threadIds: string[]) => void;
}
