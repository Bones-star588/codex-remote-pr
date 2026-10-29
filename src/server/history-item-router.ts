import { Router, type RequestHandler } from 'express';
import type { ClientRpcMethod } from '../shared/protocol.js';
import { withReadDeadline } from './bootstrap.js';

/** Read one original native item only when its execution details are expanded. */
export function historyItemRouter(requireAuth: RequestHandler,
  read: (method: ClientRpcMethod, params: unknown) => Promise<unknown>) {
  const router = Router();
  router.get('/', requireAuth, async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const ids = ['threadId', 'turnId', 'itemId'].map(key => req.query[key]);
    if (!ids.every(value => typeof value === 'string' && value.trim() && value.length <= 512)) {
      res.status(400).json({ error: 'Valid threadId, turnId and itemId are required.' }); return;
    }
    const [threadId, turnId, itemId] = ids as string[];
    const startedAt = performance.now();
    try {
      const result = await withReadDeadline(read('thread/items/read', { threadId, turnId, itemIds: [itemId] }));
      console.debug('[history-payload] detail read', { elapsedMs: Math.round(performance.now() - startedAt) });
      if (!res.destroyed) res.json(result);
    } catch (error) {
      console.warn('[history-payload] detail read failed', error); next(error);
    }
  });
  return router;
}
