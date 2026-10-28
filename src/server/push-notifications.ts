import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import webPush from 'web-push';
import type { PushSubscription, VapidKeys } from 'web-push';

interface PushState {
  keys: VapidKeys;
  subscriptions: PushSubscription[];
  watchedThreads: string[];
}

interface NotificationPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  threadId?: string;
}

function subscriptionValue(value: unknown): PushSubscription | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PushSubscription>;
  if (typeof candidate.endpoint !== 'string' || !candidate.keys) return null;
  try {
    const endpoint = new URL(candidate.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return null;
    const { p256dh, auth } = candidate.keys;
    if (typeof p256dh !== 'string' || typeof auth !== 'string'
      || !/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth)
      || Buffer.from(p256dh, 'base64url').length !== 65 || Buffer.from(auth, 'base64url').length !== 16) return null;
    return {
      endpoint: candidate.endpoint,
      keys: { p256dh, auth },
      ...(typeof candidate.expirationTime === 'number' ? { expirationTime: candidate.expirationTime } : {})
    };
  } catch { return null; }
}

export class PushNotifications {
  private readonly file: string;
  private readonly state: PushState;
  private readonly subscriptions: Map<string, PushSubscription>;
  private readonly watchedThreads: Set<string>;

  constructor(dataDir: string, private readonly subject: string) {
    this.file = path.join(dataDir, 'web-push.json');
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(this.file)) {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')) as PushState;
    } else {
      this.state = { keys: webPush.generateVAPIDKeys(), subscriptions: [], watchedThreads: [] };
    }
    this.subscriptions = new Map(this.state.subscriptions.map(subscription => [subscription.endpoint, subscription]));
    this.watchedThreads = new Set(this.state.watchedThreads);
    if (!fs.existsSync(this.file)) this.save();
  }

  get publicKey(): string {
    return this.state.keys.publicKey;
  }

  private save(): void {
    this.state.subscriptions = [...this.subscriptions.values()];
    this.state.watchedThreads = [...this.watchedThreads];
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  subscribe(value: unknown): boolean {
    const subscription = subscriptionValue(value);
    if (!subscription) return false;
    this.subscriptions.set(subscription.endpoint, subscription);
    this.save();
    return true;
  }

  status(endpoint: string): boolean {
    return this.subscriptions.has(endpoint);
  }

  unsubscribe(endpoint: string): void {
    if (this.subscriptions.delete(endpoint)) this.save();
  }

  // The caller admits only ordinary persisted chats, never side chats or subagents.
  watch(threadId: string): void {
    if (!threadId || this.watchedThreads.has(threadId)) return;
    this.watchedThreads.add(threadId);
    this.save();
  }

  async notifyTurn(params: Record<string, unknown>): Promise<void> {
    const threadId = typeof params.threadId === 'string' ? params.threadId : '';
    const turn = params.turn as { id?: string; status?: string } | undefined;
    if (!this.watchedThreads.has(threadId) || !turn?.id) return;
    const body = turn.status === 'completed' ? '\u4efb\u52a1\u5df2\u5b8c\u6210'
      : turn.status === 'interrupted' ? '\u4efb\u52a1\u5df2\u505c\u6b62'
      : turn.status === 'failed' ? '\u4efb\u52a1\u6267\u884c\u5931\u8d25' : null;
    if (body) await this.notify({
      title: 'Codex', body, tag: `codex-turn-${threadId}`,
      url: `/?thread=${encodeURIComponent(threadId)}`, threadId
    });
  }

  async notifyApproval(params: Record<string, unknown>): Promise<void> {
    const threadId = typeof params.threadId === 'string' ? params.threadId : '';
    if (!this.watchedThreads.has(threadId)) return;
    await this.notify({
      title: 'Codex', body: '\u4efb\u52a1\u9700\u8981\u4f60\u7684\u786e\u8ba4',
      tag: `codex-approval-${threadId}`, url: `/?thread=${encodeURIComponent(threadId)}`, threadId
    });
  }

  private async send(subscription: PushSubscription, payload: NotificationPayload): Promise<void> {
    let timer: ReturnType<typeof setTimeout>;
    try {
      const sending = webPush.sendNotification(subscription, JSON.stringify(payload), {
        vapidDetails: { subject: this.subject, ...this.state.keys },
        timeout: 8000, TTL: 300, urgency: 'high', contentEncoding: 'aes128gcm'
      });
      await Promise.race([
        sending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Push delivery timed out.')), 8000);
        })
      ]);
    } catch (error) {
      const statusCode = (error as { statusCode?: number } | null)?.statusCode;
      if (statusCode === 404 || statusCode === 410) this.unsubscribe(subscription.endpoint);
      throw error;
    } finally {
      clearTimeout(timer!);
    }
  }

  private async notify(payload: NotificationPayload): Promise<void> {
    await Promise.allSettled([...this.subscriptions.values()].map(subscription => this.send(subscription, payload)));
  }

  async test(endpoint: string): Promise<'sent' | 'missing' | 'failed'> {
    const subscription = this.subscriptions.get(endpoint);
    if (!subscription) return 'missing';
    try {
      await this.send(subscription, {
        title: 'Codex', body: '\u901a\u77e5\u5df2\u8fde\u901a', tag: 'codex-test', url: '/'
      });
      return 'sent';
    } catch { return 'failed'; }
  }

  router(): Router {
    const router = Router();
    router.get('/public-key', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ publicKey: this.publicKey });
    });
    router.post('/status', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ enabled: typeof req.body?.endpoint === 'string' && this.status(req.body.endpoint) });
    });
    router.post('/subscription', (req, res) => {
      if (!this.subscribe(req.body?.subscription)) {
        res.status(400).json({ error: 'A valid browser push subscription is required.' });
        return;
      }
      res.json({ ok: true });
    });
    router.delete('/subscription', (req, res) => {
      if (typeof req.body?.endpoint === 'string') this.unsubscribe(req.body.endpoint);
      res.json({ ok: true });
    });
    router.post('/test', async (req, res) => {
      const result = await this.test(typeof req.body?.endpoint === 'string' ? req.body.endpoint : '');
      if (result === 'missing') res.status(404).json({ error: 'Enable notifications on this device first.' });
      else if (result === 'failed') res.status(502).json({ error: 'Push delivery failed. Please retry.' });
      else res.json({ ok: true });
    });
    return router;
  }
}
