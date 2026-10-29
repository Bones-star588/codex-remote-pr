import { Download, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { refreshAppVersion, updateStageLabels } from '../app-update';
import './notification-settings.css';

export function AppUpdateDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('检查服务器版本，下载完成后刷新此页面。');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => operation.current?.abort();
  }, []);
  async function refresh() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError(null);
    try {
      await refreshAppVersion({ signal: controller.signal, onStage: (stage, build) => {
        setStatus(`${updateStageLabels[stage]}${build ? `（${build.version}）` : ''}`);
      } });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      operation.current = null;
    }
  }
  return <dialog ref={dialog} className="notification-settings" aria-labelledby="app-update-title"
    onClose={onClose} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <header><h2 id="app-update-title"><Download size={18} />刷新版本</h2>
      <button type="button" className="icon-button" aria-label="关闭版本更新" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <div className="notification-settings-body">
      <p className="notification-intro">当前版本：{import.meta.env.VITE_APP_VERSION}</p>
      <button type="button" className="notification-enable" disabled={busy} onClick={() => void refresh()}>
        {busy ? <LoaderCircle size={18} className="spin" /> : <Download size={18} />}<span>{busy ? '正在更新…' : '检查并更新版本'}</span>
      </button>
      <div className="notification-feedback" role="status" aria-live="polite">
        {error ? <p className="notification-error">{error}</p> : <p>{status}</p>}
      </div>
    </div>
  </dialog>;
}
