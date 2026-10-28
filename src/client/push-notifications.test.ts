import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableDeviceNotifications, enableDeviceNotifications, getNotificationCapability,
  readDeviceNotificationState, sendDeviceTestNotification, unlinkDeviceNotifications
} from './push-notifications';

describe('device website notifications', () => {
  let subscription: {
    endpoint: string;
    toJSON: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
  let pushManager: {
    getSubscription: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  let browser: {
    isSecureContext: boolean;
    matchMedia: ReturnType<typeof vi.fn>;
    Notification?: unknown;
    PushManager?: unknown;
  };
  let navigation: {
    userAgent: string;
    platform: string;
    maxTouchPoints: number;
    serviceWorker: { ready: Promise<unknown> };
  };
  let notifications: {
    permission: NotificationPermission;
    requestPermission: ReturnType<typeof vi.fn>;
  };
  let fetcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    subscription = {
      endpoint: 'https://push.example.test/device',
      toJSON: vi.fn(() => ({ endpoint: 'https://push.example.test/device', keys: { p256dh: 'public', auth: 'synthetic' } })),
      unsubscribe: vi.fn(async () => true)
    };
    pushManager = {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async () => subscription)
    };
    notifications = { permission: 'default', requestPermission: vi.fn(async () => 'granted') };
    browser = {
      isSecureContext: true,
      matchMedia: vi.fn(() => ({ matches: false })),
      Notification: notifications,
      PushManager: {}
    };
    navigation = {
      userAgent: 'Desktop browser', platform: 'Win32', maxTouchPoints: 0,
      serviceWorker: { ready: Promise.resolve({ pushManager }) }
    };
    fetcher = vi.fn(async (path: string) => ({
      ok: true,
      text: async () => JSON.stringify(path.endsWith('/public-key')
        ? { publicKey: 'AQID' } : path.endsWith('/status') ? { enabled: true } : { ok: true })
    }));
    vi.stubGlobal('window', browser);
    vi.stubGlobal('navigator', navigation);
    vi.stubGlobal('Notification', notifications);
    vi.stubGlobal('fetch', fetcher);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('requires HTTPS and an Apple home-screen installation before requesting permission', async () => {
    browser.isSecureContext = false;
    expect(getNotificationCapability()).toEqual({ supported: false, reason: 'https' });
    browser.isSecureContext = true;
    navigation.userAgent = 'iPhone Safari';
    expect(getNotificationCapability()).toEqual({ supported: false, reason: 'home-screen' });
    await expect(enableDeviceNotifications()).rejects.toThrow('不支持');
    expect(notifications.requestPermission).not.toHaveBeenCalled();
    browser.matchMedia.mockReturnValue({ matches: true });
    expect(getNotificationCapability()).toEqual({ supported: true, reason: null });
  });

  it('asks inside the initial click before any network or service-worker await', async () => {
    let grant!: (permission: NotificationPermission) => void;
    notifications.requestPermission.mockReturnValue(new Promise(resolve => { grant = resolve; }));
    const enabling = enableDeviceNotifications();
    expect(notifications.requestPermission).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(pushManager.getSubscription).not.toHaveBeenCalled();
    grant('granted');
    expect(await enabling).toEqual({ permission: 'granted', enabled: true, subscribed: true });
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3])
    });
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/notifications/public-key', '/api/notifications/subscription'
    ]);
  });

  it('does not report enabled when server registration fails, and removes the newly created browser subscription', async () => {
    fetcher.mockImplementation(async (path: string) => ({
      ok: path.endsWith('/public-key'), status: 503,
      text: async () => JSON.stringify(path.endsWith('/public-key') ? { publicKey: 'AQID' } : { error: 'Offline' })
    }));
    await expect(enableDeviceNotifications()).rejects.toThrow('Offline');
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('relinks an existing browser subscription without asking again or resubscribing', async () => {
    notifications.permission = 'granted';
    pushManager.getSubscription.mockResolvedValue(subscription);
    expect((await enableDeviceNotifications()).enabled).toBe(true);
    expect(notifications.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('confirms the server disabled notifications before unsubscribing the browser', async () => {
    notifications.permission = 'granted';
    pushManager.getSubscription.mockResolvedValue(subscription);
    const order: string[] = [];
    fetcher.mockImplementation(async () => {
      order.push('server');
      return { ok: true, text: async () => JSON.stringify({ ok: true }) };
    });
    subscription.unsubscribe.mockImplementation(async () => { order.push('browser'); return true; });
    expect(await disableDeviceNotifications()).toEqual({ permission: 'granted', enabled: false, subscribed: false });
    expect(order).toEqual(['server', 'browser']);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
  });

  it('keeps a browser subscription when server removal fails', async () => {
    pushManager.getSubscription.mockResolvedValue(subscription);
    fetcher.mockResolvedValue({ ok: false, status: 503, text: async () => JSON.stringify({ error: 'Retry later' }) });
    await expect(disableDeviceNotifications()).rejects.toThrow('Retry later');
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('checks both browser permission and server status, and sends tests only to the current subscription', async () => {
    notifications.permission = 'denied';
    pushManager.getSubscription.mockResolvedValue(subscription);
    expect(await readDeviceNotificationState()).toEqual({ permission: 'denied', enabled: false, subscribed: true });
    await sendDeviceTestNotification();
    expect(fetcher.mock.calls.at(-1)).toMatchObject([
      '/api/notifications/test', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }
    ]);
  });

  it('unlinks notifications before logout using the authenticated removal endpoint', async () => {
    pushManager.getSubscription.mockResolvedValue(subscription);
    await unlinkDeviceNotifications();
    expect(fetcher.mock.calls[0]![0]).toBe('/api/notifications/subscription');
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('bounds service-worker readiness rather than hanging settings indefinitely', async () => {
    vi.useFakeTimers();
    navigation.serviceWorker.ready = new Promise(() => {});
    const checking = readDeviceNotificationState();
    const assertion = expect(checking).rejects.toThrow('尚未就绪');
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(fetcher).not.toHaveBeenCalled();
  });
});
