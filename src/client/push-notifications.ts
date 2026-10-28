import { api } from './api';

export interface NotificationCapability {
  supported: boolean;
  reason: 'https' | 'home-screen' | 'unsupported' | null;
}

export interface DeviceNotificationState {
  permission: NotificationPermission;
  enabled: boolean;
  subscribed: boolean;
}

const TIMEOUT = 8000;

export function getNotificationCapability(): NotificationCapability {
  if (!window.isSecureContext) return { supported: false, reason: 'https' };
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (appleMobile && !standalone) return { supported: false, reason: 'home-screen' };
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, reason: 'unsupported' };
  }
  return { supported: true, reason: null };
}

function notificationApi<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  return api<T>(`/api/notifications/${path}`, {
    method,
    cache: 'no-store',
    timeoutMs: TIMEOUT,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function registration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('通知服务尚未就绪，请联网刷新后重试。')), TIMEOUT);
      })
    ]);
  } finally { clearTimeout(timer); }
}

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export async function readDeviceNotificationState(): Promise<DeviceNotificationState> {
  if (!getNotificationCapability().supported) {
    return { permission: 'default', enabled: false, subscribed: false };
  }
  const subscription = await (await registration()).pushManager.getSubscription();
  if (!subscription) return { permission: Notification.permission, enabled: false, subscribed: false };
  const result = await notificationApi<{ enabled: boolean }>('status', { endpoint: subscription.endpoint });
  return {
    permission: Notification.permission,
    enabled: Notification.permission === 'granted' && result.enabled,
    subscribed: true
  };
}

export function enableDeviceNotifications(): Promise<DeviceNotificationState> {
  if (!getNotificationCapability().supported) {
    return Promise.reject(new Error('当前环境暂不支持网站通知。'));
  }
  // iOS requires requesting permission in the original click, before any await.
  const permission = Notification.permission === 'granted'
    ? Promise.resolve<NotificationPermission>('granted')
    : Notification.requestPermission();
  return permission.then(async result => {
    if (result !== 'granted') {
      throw new Error(result === 'denied'
        ? '通知权限已被关闭，请在浏览器或系统设置中允许通知。'
        : '尚未允许通知，可以再次点击开启。');
    }
    const worker = await registration();
    let subscription = await worker.pushManager.getSubscription();
    let created = false;
    if (!subscription) {
      const { publicKey } = await notificationApi<{ publicKey: string }>('public-key', undefined, 'GET');
      subscription = await worker.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: applicationKey(publicKey)
      });
      created = true;
    }
    try {
      await notificationApi('subscription', { subscription: subscription.toJSON() });
    } catch (error) {
      if (created) await subscription.unsubscribe().catch(() => undefined);
      throw error;
    }
    return { permission: 'granted', enabled: true, subscribed: true };
  });
}

export async function disableDeviceNotifications(): Promise<DeviceNotificationState> {
  if (!getNotificationCapability().supported) {
    return { permission: 'default', enabled: false, subscribed: false };
  }
  const subscription = await (await registration()).pushManager.getSubscription();
  if (subscription) {
    await notificationApi('subscription', { endpoint: subscription.endpoint }, 'DELETE');
    if (!await subscription.unsubscribe()) {
      throw new Error('服务端已关闭通知，浏览器订阅清理失败，请重试。');
    }
  }
  return { permission: Notification.permission, enabled: false, subscribed: false };
}

export async function sendDeviceTestNotification(): Promise<void> {
  const subscription = await (await registration()).pushManager.getSubscription();
  if (!subscription) throw new Error('请先开启此设备的网站通知。');
  await notificationApi('test', { endpoint: subscription.endpoint });
}

export async function unlinkDeviceNotifications(): Promise<void> {
  if (!getNotificationCapability().supported) return;
  await disableDeviceNotifications();
}
