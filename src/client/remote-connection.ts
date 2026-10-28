import type { ServerMessage } from '../shared/protocol';
import { synchronizeHostClock } from './host-clock';
import { HttpChannel, type RemoteChannel } from './http-channel';
export type { RemoteChannel } from './http-channel';

interface ConnectionOptions<Message> {
  url: string;
  readyType?: string;
  httpFallback?: string;
  onSocket: (socket: RemoteChannel | null) => void;
  onOpen: () => void;
  onMessage: (message: Message) => void;
  onDisconnect: (error: Error) => void;
}

export class RemoteConnection<Message extends { type: string } = ServerMessage> {
  private socket: RemoteChannel | null = null;
  private stopped = true;
  private failures = 0;
  private reconnectTimer: number | undefined;
  private connectTimer: number | undefined;
  private heartbeatTimer: number | undefined;
  private pongTimer: number | undefined;
  private pingSentAtMs: number | undefined;
  private http = false;
  private suspended = false;
  private synchronized = false;

  constructor(private readonly options: ConnectionOptions<Message>) {
    if (options.httpFallback) {
      try { this.http = sessionStorage.getItem('remote-http-transport') === '1'; } catch { /* Optional route preference. */ }
    }
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener('online', this.online);
    window.addEventListener('offline', this.offline);
    window.addEventListener('focus', this.recover);
    window.addEventListener('pageshow', this.recover);
    document.addEventListener('visibilitychange', this.recover);
    this.connect();
  }

  reconnect(): void {
    if (this.stopped) return;
    this.failures = 0;
    if (this.socket) this.disconnect(this.socket, 'Reconnecting to Remote...');
    this.connect();
  }

  dispose(): void {
    this.stopped = true;
    window.removeEventListener('online', this.online);
    window.removeEventListener('offline', this.offline);
    window.removeEventListener('focus', this.recover);
    window.removeEventListener('pageshow', this.recover);
    document.removeEventListener('visibilitychange', this.recover);
    window.clearTimeout(this.reconnectTimer);
    this.clearSocketTimers();
    const socket = this.socket;
    this.socket = null;
    this.options.onSocket(null);
    socket?.close();
  }

  private connect = (): void => {
    window.clearTimeout(this.reconnectTimer);
    if (this.stopped || this.socket || !navigator.onLine) return;
    const socket: RemoteChannel = this.http && this.options.httpFallback
      ? new HttpChannel(this.options.httpFallback) : new WebSocket(this.options.url);
    this.socket = socket;
    this.synchronized = false;
    this.suspended = document.visibilityState !== 'visible';
    this.options.onSocket(socket);
    this.armHandshake(socket);

    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.stopped) return;
      window.clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
      if (this.options.readyType) {
        this.armHandshake(socket);
      } else { this.failures = 0; this.synchronized = true; }
      this.options.onOpen();
      this.ping();
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket || this.stopped) return;
      let message: Message;
      try {
        message = JSON.parse(String((event as MessageEvent).data)) as Message;
      } catch {
        return;
      }
      if (message.type === this.options.readyType) {
        window.clearTimeout(this.connectTimer);
        this.connectTimer = undefined;
        this.failures = 0;
        this.synchronized = true;
        if (this.http) {
          try { sessionStorage.setItem('remote-http-transport', '1'); } catch { /* Optional route preference. */ }
        }
      }
      if (message.type === 'pong') {
        if (this.pingSentAtMs !== undefined && 'at' in message && typeof message.at === 'string') {
          const serverTimeMs = Date.parse(message.at);
          if (Number.isFinite(serverTimeMs)) synchronizeHostClock(serverTimeMs, this.pingSentAtMs, Date.now());
        }
        this.pingSentAtMs = undefined;
        window.clearTimeout(this.pongTimer);
        this.pongTimer = undefined;
        window.clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = window.setTimeout(this.ping, 20_000);
      }
      this.options.onMessage(message);
    });
    socket.addEventListener('close', () => {
      this.disconnect(socket, 'Remote connection closed. Reconnecting...');
    });
    socket.addEventListener('error', event => {
      const error = (event as Event & { error?: Error }).error;
      this.disconnect(socket, error ?? 'Remote connection lost. Reconnecting...');
    });
  };

  private armHandshake(socket: RemoteChannel): void {
    window.clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    if (document.visibilityState !== 'visible') return;
    const connecting = socket.readyState === WebSocket.CONNECTING;
    const timeout = this.http ? 12_000 : connecting && this.options.httpFallback ? 3000 : 6000;
    this.connectTimer = window.setTimeout(() => {
      this.connectTimer = undefined;
      if (document.visibilityState !== 'visible') { this.suspended = true; return; }
      this.disconnect(socket, connecting
        ? 'Remote connection timed out. Reconnecting...'
        : 'Remote synchronization timed out. Reconnecting...');
    }, timeout);
  }

  private clearSocketTimers(): void {
    window.clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    this.clearHeartbeat();
  }

  private clearHeartbeat(): void {
    window.clearTimeout(this.heartbeatTimer);
    window.clearTimeout(this.pongTimer);
    this.pongTimer = undefined;
    this.pingSentAtMs = undefined;
  }

  private disconnect(socket: RemoteChannel, message: string | Error): void {
    if (this.socket !== socket) return;
    this.clearSocketTimers();
    this.socket = null;
    this.options.onSocket(null);
    socket.close();
    this.options.onDisconnect(typeof message === 'string' ? new Error(message) : message);
    window.clearTimeout(this.reconnectTimer);
    if (!this.stopped && navigator.onLine) {
      if (!this.http && this.options.httpFallback) {
        this.http = true;
        this.connect();
        return;
      }
      const ceiling = document.visibilityState === 'visible' ? 5000 : 15_000;
      const delay = Math.min(250 * 2 ** Math.min(this.failures++, 6), ceiling);
      this.reconnectTimer = window.setTimeout(this.connect, delay);
    }
  }

  private ping = (): void => {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.pongTimer !== undefined ||
        document.visibilityState !== 'visible') return;
    window.clearTimeout(this.heartbeatTimer);
    this.pongTimer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') { this.clearHeartbeat(); return; }
      // A suspended event loop must get a fresh probe instead of an expired timeout.
      if (this.pingSentAtMs !== undefined && Date.now() - this.pingSentAtMs > 20_000) {
        this.clearHeartbeat();
        this.ping();
        return;
      }
      this.disconnect(socket, 'Remote heartbeat timed out. Reconnecting...');
    }, 12_000);
    try {
      this.pingSentAtMs = Date.now();
      socket.send(JSON.stringify({ type: 'ping' }));
    } catch {
      this.disconnect(socket, 'Remote connection lost. Reconnecting...');
    }
  };

  private online = (): void => {
    this.failures = 0;
    this.recover();
  };

  private offline = (): void => {
    window.clearTimeout(this.reconnectTimer);
    if (this.socket) this.disconnect(this.socket, 'Network is offline.');
  };

  private recover = (event?: Event): void => {
    if (document.visibilityState !== 'visible') {
      this.suspended = true;
      window.clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
      this.clearHeartbeat();
      return;
    }
    const resumed = this.suspended || event?.type === 'pageshow' && (event as PageTransitionEvent).persisted;
    this.suspended = false;
    if (resumed) this.clearHeartbeat();
    if (!this.socket) this.connect();
    else {
      // Focus/pageshow during normal use must not shorten or extend a handshake.
      if (resumed && !this.synchronized) this.armHandshake(this.socket);
      this.ping();
    }
  };
}
