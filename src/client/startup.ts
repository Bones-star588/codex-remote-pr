import { api } from './api';
import type { WorkspaceBootstrap } from './types';

export interface SessionState {
  configured: boolean;
  authenticated: boolean;
  setupAllowed: boolean;
  authFile?: string;
}

interface BootstrapResponse extends SessionState {
  workspace: WorkspaceBootstrap | null;
}

const RETURNING_DEVICE = 'remote:returning-device';

// This hint opens the empty public UI only. The server still verifies every read.
export function isReturningDevice(): boolean {
  try { return localStorage.getItem(RETURNING_DEVICE) === '1'; }
  catch { return false; }
}

export function rememberDevice(authenticated: boolean): void {
  try {
    if (authenticated) localStorage.setItem(RETURNING_DEVICE, '1');
    else localStorage.removeItem(RETURNING_DEVICE);
  } catch { /* Storage can be unavailable in browser privacy modes. */ }
}

export function startSession(signal: AbortSignal, established = false) {
  const statusController = new AbortController();
  const abortStatus = () => statusController.abort();
  signal.addEventListener('abort', abortStatus, { once: true });
  if (signal.aborted) abortStatus();
  const bootstrap = api<BootstrapResponse>('/api/bootstrap', {
    cache: 'no-store', signal, timeoutMs: 6000
  });
  const status = established
    ? Promise.resolve<SessionState>({ configured: true, authenticated: true, setupAllowed: false })
    : api<SessionState>('/api/auth/status', {
      cache: 'no-store', signal: statusController.signal, timeoutMs: 6000
    });
  const auth = Promise.any([status, bootstrap]).then(state => {
    markStartup('auth');
    return state;
  });
  // A verified bootstrap can open the workspace even if the status request stalls.
  void bootstrap.then(abortStatus, () => {});
  const cleanup = () => {
    signal.removeEventListener('abort', abortStatus);
  };
  void status.then(cleanup, cleanup);
  const workspace = bootstrap.then(result => {
    markStartup('bootstrap');
    return result.authenticated ? result.workspace : null;
  }).catch(() => null);
  return { auth, workspace };
}

export function markStartup(phase: string): void {
  const name = `remote:${phase}`;
  performance.clearMarks(name);
  performance.mark(name);
}
