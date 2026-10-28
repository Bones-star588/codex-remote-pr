import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import express from 'express';
import webPush from 'web-push';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushNotifications } from './push-notifications.js';

const directories: string[] = [];
const servers: http.Server[] = [];
const sent = { statusCode: 201, body: '', headers: {} };

function create() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-push-'));
  directories.push(directory);
  return { directory, notifications: new PushNotifications(directory, 'https://remote.example.test') };
}

function subscription(id = 'device') {
  return {
    endpoint: `https://push.example.test/${id}`,
    keys: {
      p256dh: webPush.generateVAPIDKeys().publicKey,
      auth: Buffer.alloc(16, 1).toString('base64url')
    }
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('private standard Web Push subscriptions', () => {
  it('persists stable VAPID keys, subscriptions and ordinary-chat scope across restarts', async () => {
    const generate = vi.spyOn(webPush, 'generateVAPIDKeys');
    const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue(sent);
    const { directory, notifications } = create();
    const device = subscription();
    const generations = generate.mock.calls.length;
    expect(notifications.subscribe(device)).toBe(true);
    notifications.watch('ordinary-chat');
    const restarted = new PushNotifications(directory, 'https://remote.example.test');
    expect(generate).toHaveBeenCalledTimes(generations);
    expect(restarted.publicKey).toBe(notifications.publicKey);
    expect(restarted.status(device.endpoint)).toBe(true);
    await restarted.notifyTurn({ threadId: 'ordinary-chat', turn: { id: 'turn', status: 'completed' } });
    expect(send).toHaveBeenCalledOnce();
    const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'web-push.json'), 'utf8'));
    expect(persisted.keys.publicKey).toBe(notifications.publicKey);
    expect(persisted.keys.privateKey).toBeTruthy();
    expect(persisted.subscriptions).toEqual([device]);
    expect(persisted.watchedThreads).toEqual(['ordinary-chat']);
    restarted.unsubscribe(device.endpoint);
    expect(new PushNotifications(directory, 'https://remote.example.test').status(device.endpoint)).toBe(false);
  });

  it('sends actual push-adapter payloads with generic text and the selected chat link only', async () => {
    const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue(sent);
    const { notifications } = create();
    const device = subscription();
    notifications.subscribe(device);
    notifications.watch('chat/with space');
    await notifications.notifyTurn({
      threadId: 'chat/with space',
      turn: { id: 'turn', status: 'completed', items: [{ text: 'PRIVATE_CHAT_TEXT' }] },
      cwd: 'PRIVATE_PATH'
    });
    await notifications.notifyApproval({
      threadId: 'chat/with space', command: 'PRIVATE_COMMAND', requestId: 'request'
    });
    expect(send).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(send.mock.calls[0]![1] as string);
    expect(payload).toMatchObject({
      title: 'Codex', body: '\u4efb\u52a1\u5df2\u5b8c\u6210',
      threadId: 'chat/with space', url: '/?thread=chat%2Fwith%20space'
    });
    expect(send.mock.calls[0]![2]).toMatchObject({
      TTL: 300, timeout: 8000, urgency: 'high', contentEncoding: 'aes128gcm',
      vapidDetails: { publicKey: notifications.publicKey, subject: 'https://remote.example.test' }
    });
    expect(JSON.stringify(send.mock.calls)).not.toContain('PRIVATE_');
  });

  it('ignores unwatched side/subagent chats and unfinished turns', async () => {
    const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue(sent);
    const { notifications } = create();
    notifications.subscribe(subscription());
    notifications.watch('main');
    await notifications.notifyTurn({ threadId: 'ephemeral', turn: { id: 'turn', status: 'completed' } });
    await notifications.notifyTurn({ threadId: 'child', turn: { id: 'turn', status: 'completed' } });
    await notifications.notifyApproval({ threadId: 'child' });
    await notifications.notifyTurn({ threadId: 'main', turn: { id: 'turn', status: 'inProgress' } });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([404, 410])('removes expired push endpoints after HTTP %s without rejecting the native event', async statusCode => {
    const send = vi.spyOn(webPush, 'sendNotification').mockRejectedValue({ statusCode });
    const { notifications, directory } = create();
    const device = subscription();
    notifications.subscribe(device);
    notifications.watch('main');
    await expect(notifications.notifyTurn({ threadId: 'main', turn: { id: 'turn', status: 'completed' } }))
      .resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
    expect(notifications.status(device.endpoint)).toBe(false);
    expect(new PushNotifications(directory, 'https://remote.example.test').status(device.endpoint)).toBe(false);
  });

  it('keeps transient failures subscribed and bounds a hung sender to eight seconds', async () => {
    vi.useFakeTimers();
    const send = vi.spyOn(webPush, 'sendNotification').mockRejectedValueOnce(new Error('Offline'))
      .mockImplementationOnce(() => new Promise(() => {}));
    const { notifications } = create();
    const device = subscription();
    notifications.subscribe(device);
    expect(await notifications.test(device.endpoint)).toBe('failed');
    expect(notifications.status(device.endpoint)).toBe(true);
    let settled = false;
    const pending = notifications.test(device.endpoint).then(result => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(7999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe('failed');
    expect(send).toHaveBeenCalledTimes(2);
    expect(notifications.status(device.endpoint)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects malformed subscriptions without storing arbitrary request fields', () => {
    const { notifications } = create();
    const device = subscription();
    expect(notifications.subscribe({ ...device, endpoint: 'http://push.example.test/device' })).toBe(false);
    expect(notifications.subscribe({ ...device, keys: { p256dh: 'bad', auth: 'bad' } })).toBe(false);
    expect(notifications.subscribe(null)).toBe(false);
    expect(notifications.subscribe({ ...device, privateField: 'discard' })).toBe(true);
  });

  it('provides router contracts and tests only this device endpoint', async () => {
    const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue(sent);
    const { notifications } = create();
    const app = express();
    app.use(express.json());
    app.use('/api/notifications', notifications.router());
    const server = http.createServer(app);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api/notifications`;
    const post = (route: string, body: unknown, method = 'POST') => fetch(`${base}${route}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const key = await (await fetch(`${base}/public-key`)).json();
    expect(key).toEqual({ publicKey: notifications.publicKey });
    expect(key).not.toHaveProperty('privateKey');
    const first = subscription('first');
    const second = subscription('second');
    expect((await post('/test', { endpoint: first.endpoint })).status).toBe(404);
    expect(await (await post('/status', { endpoint: first.endpoint })).json()).toEqual({ enabled: false });
    expect((await post('/subscription', { subscription: {} })).status).toBe(400);
    expect(await (await post('/subscription', { subscription: first })).json()).toEqual({ ok: true });
    await post('/subscription', { subscription: second });
    expect(await (await post('/status', { endpoint: first.endpoint })).json()).toEqual({ enabled: true });
    expect(await (await post('/test', { endpoint: first.endpoint })).json()).toEqual({ ok: true });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].endpoint).toBe(first.endpoint);
    expect(await (await post('/subscription', { endpoint: first.endpoint }, 'DELETE')).json()).toEqual({ ok: true });
    expect(await (await post('/status', { endpoint: first.endpoint })).json()).toEqual({ enabled: false });
    expect(notifications.status(second.endpoint)).toBe(true);
  });
});
