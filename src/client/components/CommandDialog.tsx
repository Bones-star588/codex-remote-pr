import { LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { McpStatus, ReviewTarget } from '../types';

export type CommandDialogState = { type: 'status' | 'mcp' } | { type: 'review'; instructions: string };

export function CommandDialog({ state, status, loadMcp, onReview, onClose }: {
  state: CommandDialogState;
  status: Array<{ label: string; value: string }>;
  loadMcp: () => Promise<McpStatus[]>;
  onReview: (target: ReviewTarget) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mcp, setMcp] = useState<McpStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [targetType, setTargetType] = useState<ReviewTarget['type']>(state.type === 'review' && state.instructions ? 'custom' : 'uncommittedChanges');
  const [value, setValue] = useState(state.type === 'review' ? state.instructions : '');
  const loader = useRef(loadMcp);
  loader.current = loadMcp;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (state.type !== 'mcp') return;
    let cancelled = false;
    void loader.current().then((result) => { if (!cancelled) setMcp(result); })
      .catch((error: Error) => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [state.type]);
  const title = state.type === 'review' ? '代码审查' : state.type === 'mcp' ? 'MCP 服务器' : '状态';
  let content: ReactNode;
  if (state.type === 'status') {
    content = <dl className="command-status">{status.map(({ label, value }) =>
      <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>;
  } else if (state.type === 'mcp') {
    content = <div className="command-mcp-list">
      {!mcp && !error && <LoaderCircle className="spin" size={18} aria-label="正在读取 MCP 状态" />}
      {mcp?.length === 0 && <p>未配置 MCP 服务器</p>}
      {mcp?.map((server) => <div className="command-mcp-row" key={server.name}>
        <strong>{server.name}</strong>
        <span>{server.runtimeStatus || server.authStatus} · {Object.keys(server.tools).length} 个工具</span>
        {server.toolsError && <p>{server.toolsError}</p>}
      </div>)}
    </div>;
  } else {
    content = <form className="command-review-form" onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      const input = value.trim();
      if (targetType !== 'uncommittedChanges' && !input) return;
      const target: ReviewTarget = targetType === 'baseBranch' ? { type: targetType, branch: input } :
        targetType === 'commit' ? { type: targetType, sha: input, title: null } :
        targetType === 'custom' ? { type: targetType, instructions: input } : { type: targetType };
      setBusy(true);
      setError(null);
      void onReview(target).then(onClose).catch((error: Error) => setError(error.message)).finally(() => setBusy(false));
    }}>
      <label htmlFor="review-target">审查范围</label>
      <select id="review-target" value={targetType} disabled={busy} onChange={(event) => {
        setTargetType(event.target.value as ReviewTarget['type']); setValue('');
      }}>
        <option value="uncommittedChanges">未提交的修改</option>
        <option value="baseBranch">与分支比较</option>
        <option value="commit">指定提交</option>
        <option value="custom">自定义审查要求</option>
      </select>
      {targetType !== 'uncommittedChanges' && <>
        <label htmlFor="review-value">{targetType === 'baseBranch' ? '基准分支' : targetType === 'commit' ? '提交 SHA' : '审查要求'}</label>
        <textarea id="review-value" value={value} required disabled={busy} rows={targetType === 'custom' ? 4 : 1}
          onChange={(event) => setValue(event.target.value)} />
      </>}
      <button className="command-primary" type="submit" disabled={busy || (targetType !== 'uncommittedChanges' && !value.trim())}>
        {busy && <LoaderCircle size={15} className="spin" />}开始审查
      </button>
    </form>;
  }
  return <dialog className="command-dialog" ref={dialog} aria-labelledby="command-dialog-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="command-dialog-head"><h2 id="command-dialog-title">{title}</h2>
      <button type="button" className="icon-button" aria-label="关闭" disabled={busy} onClick={onClose}><X size={18} /></button></div>
    <div className="command-dialog-body">{content}
      {error && <p className="command-dialog-error" role="alert">{error}</p>}
    </div>
  </dialog>;
}
