import http from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { historyItemRouter } from './history-item-router.js';
const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
});
async function fixture(read: (method: string, params: unknown) => Promise<unknown> = async () => ({ data: [] })) {
  const native = vi.fn(read);
  const app = express();
  app.use('/item', historyItemRouter((req, res, next) => {
    if (req.get('Cookie') !== 'session=operator') { res.status(401).end(); return; } next();
  }, native));
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'Native read failed.' });
  });
  const server = http.createServer(app); servers.push(server); server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/item`;
  return { native, get: (query: string, auth = true) => fetch(base + query, { headers: auth ? { Cookie: 'session=operator' } : {} }) };
}
describe('authenticated native execution detail reads', () => {
  it('rejects unauthenticated and invalid query input without accessing native data', async () => {
    const f = await fixture();
    expect((await f.get('?threadId=t&turnId=r&itemId=i', false)).status).toBe(401);
    for (const query of ['', '?threadId=t', '?threadId=t&turnId=r&itemId=',
      '?threadId=t&turnId=r&itemId=i&itemId=j', '?threadId=t&turnId=r&itemId=' + 'i'.repeat(513)]) {
      expect((await f.get(query)).status).toBe(400);
    }
    expect(f.native).not.toHaveBeenCalled();
  });
  it('returns the original complete native item with private cache policy', async () => {
    const data = [{ turnId: 'r', item: { id: 'i', type: 'commandExecution', command: 'echo synthetic',
      aggregatedOutput: 'Full output'.repeat(10000) }, startedAtMs: 10, completedAtMs: 20 }];
    const f = await fixture(async () => ({ data }));
    const response = await f.get('?threadId=t&turnId=r&itemId=i');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data });
    expect(f.native).toHaveBeenCalledExactlyOnceWith('thread/items/read', { threadId: 't', turnId: 'r', itemIds: ['i'] });
  });
  it('surfaces native failures for explicit retry', async () => {
    const f = await fixture(async () => { throw new Error('Native unavailable'); });
    expect((await f.get('?threadId=t&turnId=r&itemId=i')).status).toBe(500);
  });
});
