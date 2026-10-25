import type { ClientRpcMethod } from '../shared/protocol.js';
import { readThreadHistoryPage } from './thread-history.js';

export async function readOpenThread(
  request: (method: ClientRpcMethod, params: unknown) => Promise<unknown>,
  threadId: string,
  mode: 'resume' | 'read' | 'new'
) {
  const [result, page] = await Promise.all([
    mode === 'resume'
      ? request('thread/resume', { threadId, excludeTurns: true })
      : request('thread/read', { threadId, includeTurns: false }),
    mode === 'new'
      ? Promise.resolve({ items: [], nextCursor: null, activeTurnId: null })
      : readThreadHistoryPage(request, threadId, null, 40)
  ]);
  return { result, ...page };
}
