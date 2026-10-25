import { CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { api } from './api';
import { Workspace } from './Workspace';

interface AuthState {
  configured: boolean;
  authenticated: boolean;
  setupAllowed: boolean;
  authFile?: string;
}

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAuth = async () => {
    try {
      setAuth(await api<AuthState>('/api/auth/status'));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  useEffect(() => {
    void refreshAuth();
  }, []);

  if (!auth) return <FullScreenLoader label={error ?? '正在检查登录状态'} />;

  if (!auth.configured) {
    return <SetupPage setupAllowed={auth.setupAllowed} onDone={refreshAuth} />;
  }

  if (!auth.authenticated) {
    return <LoginPage onDone={refreshAuth} />;
  }

  return <Workspace onAuthExpired={refreshAuth} />;
}

function SetupPage({ setupAllowed, onDone }: { setupAllowed: boolean; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  return (
    <AuthShell
      title="保护远程任务"
      description="设置一个访问密码。密码只保存为本机哈希，不会发送给浏览器。"
    >
      {!setupAllowed ? (
        <div className="auth-notice">
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>需要在这台电脑上完成设置</strong>
            <p>远程连接不能创建初始密码。请打开本机地址，或运行 npm run set-password。</p>
          </div>
        </div>
      ) : (
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (password !== confirm) {
              setError('两次输入的密码不一致。');
              return;
            }
            setWorking(true);
            void api('/api/auth/setup', {
              method: 'POST',
              body: JSON.stringify({ password })
            })
              .then(onDone)
              .catch((nextError) => setError(errorMessage(nextError)))
              .finally(() => setWorking(false));
          }}
        >
          <label className="field">
            <span>访问密码</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoFocus
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <label className="field">
            <span>确认密码</span>
            <input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="primary-button primary-button--wide" disabled={working}>
            {working ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
            完成设置
          </button>
        </form>
      )}
    </AuthShell>
  );
}

function LoginPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  return (
    <AuthShell
      title="登录"
      description=""
    >
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setWorking(true);
          setError(null);
          void api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ password })
          })
            .then(onDone)
            .catch((nextError) => setError(errorMessage(nextError)))
            .finally(() => setWorking(false));
        }}
      >
        <label className="field">
          <span className="sr-only">访问密码</span>
          <input
            placeholder="密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoFocus
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="primary-button primary-button--wide" disabled={working || !password}>
          {working ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}
          登录
        </button>
      </form>
    </AuthShell>
  );
}

function AuthShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <img src="/codex-mark.svg" width={48} height={48} alt="Codex" />
        </div>
        <div className="auth-copy">
          <h1 id="auth-title">{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {children}
      </section>
    </main>
  );
}

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="fullscreen-loader" role="status">
      <LoaderCircle size={20} className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
