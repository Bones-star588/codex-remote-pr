import { Router, type RequestHandler } from 'express';
import type { ClientRpcMethod } from '../shared/protocol.js';
import { withReadDeadline } from './bootstrap.js';

type Read = (method: ClientRpcMethod, params: unknown) => Promise<unknown>;

/** Read-only dock state is independent of the browser's realtime subscription. */
export function threadDockRouter(requireAuth: RequestHandler, read: Read): Router {
  const router = Router();
  router.get('/:kind', requireAuth, async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const { kind } = req.params;
    const threadId = typeof req.query.threadId === 'string' ? req.query.threadId.trim() : '';
    const cursor = req.query.cursor;
    if (!threadId || threadId.length > 512 || kind !== 'goal' && kind !== 'queue' ||
        cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 8192)) {
      res.status(400).json({ error: 'A valid threadId and goal or queue kind are required.' });
      return;
    }
    const startedAt = performance.now();
    console.debug('[thread-dock] native read started', { kind });
    try {
      const result = await withReadDeadline(kind === 'goal'
        ? read('thread/goal/get', { threadId })
        : read('thread/queue/list', { threadId, limit: 100, ...(cursor ? { cursor } : {}) }));
      console.debug('[thread-dock] native read finished', { kind, elapsedMs: Math.round(performance.now() - startedAt) });
      if (!res.destroyed) res.json(result);
    } catch (error) {
      console.warn('[thread-dock] native read failed', { kind, error });
      next(error);
    }
  });
  return router;
}
