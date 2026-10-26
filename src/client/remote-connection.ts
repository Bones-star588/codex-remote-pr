import type { ServerMessage } from '../shared/protocol';
import { synchronizeHostClock } from './host-clock';

interface ConnectionOptions<Message> {
  url: string;
  onSocket: (socket: WebSocket | null) => void;
  onOpen: () => void;
  onMessage: (message: Message) => void;
  onDisconnect: (error: Error) => void;
}

export class RemoteConnection<Message extends { type: string } = ServerMessage> {
  private socket: WebSocket | null = null;
  private stopped = true;
  private failures = 0;
  private reconnectTimer: number | undefined;
  private connectTimer: number | undefined;
  private heartbeatTimer: number | undefined;
  private pongTimer: number | undefined;
  private pingSentAtMs: number | undefined;

  constructor(private readonly options: ConnectionOptions<Message>) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener('online', this.online);
    window.addEventListener('offline', this.offline);
    window.addEventListener('focus', this.recover);
    document.addEventListener('visibilitychange', this.recover);
    this.connect();
  }

  dispose(): void {
    this.stopped = true;
    window.removeEventListener('online', this.online);
    window.removeEventListener('offline', this.offline);
    window.removeEventListener('focus', this.recover);
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
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    this.options.onSocket(socket);
    this.connectTimer = window.setTimeout(() => {
      this.disconnect(socket, 'Remote connection timed out. Reconnecting...');
    }, 15_000);

    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.stopped) return;
      window.clearTimeout(this.connectTimer);
      this.failures = 0;
      this.options.onOpen();
      this.ping();
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket || this.stopped) return;
      let message: Message;
      try {
        message = JSON.parse(String(event.data)) as Message;
      } catch {
        return;
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
    socket.addEventListener('error', () => {
      this.disconnect(socket, 'Remote connection lost. Reconnecting...');
    });
  };

  private clearSocketTimers(): void {
    window.clearTimeout(this.connectTimer);
    window.clearTimeout(this.heartbeatTimer);
    window.clearTimeout(this.pongTimer);
    this.pongTimer = undefined;
    this.pingSentAtMs = undefined;
  }

  private disconnect(socket: WebSocket, message: string): void {
    if (this.socket !== socket) return;
    this.clearSocketTimers();
    this.socket = null;
    this.options.onSocket(null);
    socket.close();
    this.options.onDisconnect(new Error(message));
    window.clearTimeout(this.reconnectTimer);
    if (!this.stopped && navigator.onLine) {
      const delay = Math.min(1500 * 2 ** this.failures++, 15_000);
      this.reconnectTimer = window.setTimeout(this.connect, delay);
    }
  }

  private ping = (): void => {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.pongTimer !== undefined) return;
    window.clearTimeout(this.heartbeatTimer);
    this.pongTimer = window.setTimeout(() => {
      this.disconnect(socket, 'Remote heartbeat timed out. Reconnecting...');
    }, 10_000);
    try {
      this.pingSentAtMs = Date.now();
      socket.send(JSON.stringify({ type: 'ping' }));
    } catch {
      this.disconnect(socket, 'Remote connection lost. Reconnecting...');
    }
  };

  private online = (): void => {
    if (this.socket) this.disconnect(this.socket, 'Network changed. Reconnecting...');
    this.connect();
  };

  private offline = (): void => {
    window.clearTimeout(this.reconnectTimer);
    if (this.socket) this.disconnect(this.socket, 'Network is offline.');
  };

  private recover = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (!this.socket) this.connect();
    else this.ping();
  };
}
