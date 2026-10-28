import { Router, type RequestHandler } from 'express';
import type { ClientRpcMethod } from '../shared/protocol.js';

type Read = (method: ClientRpcMethod, params: unknown) => Promise<unknown>;

export function metadataRouter(requireAuth: RequestHandler, read: Read): Router {
  const router = Router();
  router.get('/', requireAuth, async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const kind = req.query.kind;
    if (kind !== 'projects' && kind !== 'models') {
      res.status(400).json({ error: 'kind must be projects or models.' });
      return;
    }
    try {
      res.json(await (kind === 'projects'
        ? read('project/list', { limit: 200 })
        : read('model/list', { limit: 100, includeHidden: false })));
    } catch (error) { next(error); }
  });
  return router;
}
