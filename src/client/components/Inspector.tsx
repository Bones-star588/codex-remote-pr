import {
  AlignJustify, ChevronDown, ChevronsDownUp, ChevronsUpDown, Columns2,
  FileCode2, Folder, GitBranch, TerminalSquare, WrapText, X, Plus
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { itemKey } from '../remote-state';
import { buildReviewTurns, splitDiffLines, type DiffLine, type ReviewFile } from '../review-model';
import type { Thread, ThreadItem } from '../types';

interface InspectorProps {
  open: boolean;
  thread: Thread | null;
  items: ThreadItem[];
  onClose: () => void;
  layout: 'desktop' | 'mobile';
  view: 'changes' | 'activity' | 'files';
}

export function Inspector({ open, thread, items, onClose, layout, view }: InspectorProps) {
  const [tab, setTab] = useState<'launcher' | 'changes' | 'activity' | 'files'>('changes');
  const inspectorRef = useRef<HTMLElement>(null);
  useEffect(() => { setTab(view); }, [view]);
  useEffect(() => {
    if (!open || layout !== 'mobile') return;
    const previous = document.activeElement as HTMLElement | null;
    inspectorRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus({ preventScroll: true });
  }, [open, layout]);

  if (!open) return null;
  const commands = items.filter((item) => item.type === 'commandExecution');
  const changedPaths = [...new Set(items.flatMap((item) => item.type === 'fileChange' ? item.changes.map((change) => change.path) : []))];
  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: 'launcher', label: '新标签页' },
    { id: 'changes', label: `审阅 ${changedPaths.length}` },
    ...(tab === 'activity' ? [{ id: 'activity' as const, label: '命令记录' }] : []),
    ...(tab === 'files' ? [{ id: 'files' as const, label: '文件' }] : [])
  ];
  return (
    <>
      <button type="button" className="inspector-backdrop" aria-label="关闭检查器" onClick={onClose} tabIndex={-1} />
      <aside id="workspace-inspector" className="inspector" ref={inspectorRef} aria-label="任务检查器"
        onKeyDown={(event) => {
          if (event.key !== 'Tab' || layout !== 'mobile') return;
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select, summary')];
          if (event.shiftKey && document.activeElement === controls[0]) {
            event.preventDefault(); controls.at(-1)?.focus();
          } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
            event.preventDefault(); controls[0]?.focus();
          }
        }}>
        <header className="inspector-head">
          <div className="inspector-tabs" role="tablist" aria-label="检查器视图">
            {tabs.map(({ id, label }) => (
              <button type="button" role="tab" key={id} aria-selected={tab === id}
                id={`inspector-tab-${id}`} aria-controls="inspector-content"
                className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="inspector-head-tools">
            <button type="button" className="icon-button" onClick={() => setTab('launcher')} aria-label="新标签页" title="新标签页"><Plus size={16} /></button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="关闭检查器" title="关闭检查器"><X size={16} /></button>
          </div>
        </header>
        <div className="inspector-body" id="inspector-content" role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
          {tab === 'launcher' ? <div className="inspector-launcher">
            <button type="button" onClick={() => setTab('changes')}><FileCode2 size={16} />审阅</button>
            <button type="button" onClick={() => setTab('activity')}><TerminalSquare size={16} />命令记录</button>
            <button type="button" onClick={() => setTab('files')}><Folder size={16} />文件</button>
          </div> : !thread ? <EmptyInspector text="选择一个任务" /> : tab === 'changes' ? (
            <Review items={items} cwd={thread.cwd} />
          ) : tab === 'activity' ? (
            <div className="inspector-list">
              {commands.length === 0 && <EmptyInspector text="暂无命令记录" />}
              {commands.map((command) => <CommandDetail key={itemKey(command)} command={command} />)}
            </div>
          ) : (
            <div className="inspector-list">
              <div className="inspector-path-row"><Folder size={15} /><code title={thread.cwd}>{thread.cwd}</code></div>
              {thread.gitInfo?.branch && <div className="inspector-path-row"><GitBranch size={15} /><span>{thread.gitInfo.branch}</span></div>}
              {changedPaths.map((path) => (
                <div className="inspector-path-row" key={path}><FileCode2 size={15} /><code title={path}>{displayPath(path, thread.cwd)}</code></div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Review({ items, cwd }: { items: ThreadItem[]; cwd: string }) {
  const turns = useMemo(() => buildReviewTurns(items), [items]);
  const [selectedTurn, setSelectedTurn] = useState('');
  const [mode, setMode] = useState<'unified' | 'split'>(() => localStorage.getItem('review-mode') === 'split' ? 'split' : 'unified');
  const [wrap, setWrap] = useState(() => localStorage.getItem('review-wrap') === 'true');
  const [expanded, setExpanded] = useState(false);
  const turn = turns.find((value) => value.id === selectedTurn) ?? turns[0];
  if (!turn?.files.length) return <EmptyInspector text="暂无文件变更" />;
  const added = turn.files.reduce((count, file) => count + file.added, 0);
  const deleted = turn.files.reduce((count, file) => count + file.deleted, 0);
  return (
    <div className={`review review--${mode}${wrap ? ' review--wrap' : ''}`}>
      <div className="review-toolbar">
        <span className="review-file-count">{turn.files.length} 个文件</span>
        <span className="diff-stat"><span className="diff-added">+{added}</span><span className="diff-deleted">−{deleted}</span></span>
        <button type="button" className="icon-button icon-button--small" title={wrap ? '关闭自动换行' : '自动换行'}
          aria-label="自动换行" aria-pressed={wrap} onClick={() => {
            localStorage.setItem('review-wrap', String(!wrap)); setWrap(!wrap);
          }}><WrapText size={15} /></button>
        <button type="button" className="icon-button icon-button--small" title={mode === 'unified' ? '并排显示' : '统一显示'}
          aria-label="并排显示" aria-pressed={mode === 'split'} onClick={() => {
            const next = mode === 'unified' ? 'split' : 'unified';
            localStorage.setItem('review-mode', next); setMode(next);
          }}>{mode === 'unified' ? <Columns2 size={15} /> : <AlignJustify size={15} />}</button>
        <button type="button" className="icon-button icon-button--small" title={expanded ? '全部折叠' : '全部展开'}
          aria-label={expanded ? '全部折叠' : '全部展开'} onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
        </button>
      </div>
      {turns.length > 1 && (
        <label className="review-turn-picker"><span className="sr-only">选择变更轮次</span>
          <select value={turn.id} onChange={(event) => setSelectedTurn(event.target.value)}>
            {turns.map((value, index) => <option key={value.id} value={value.id}>{index === 0 ? '最近一轮变更' : `较早变更 ${index}`}</option>)}
          </select>
        </label>
      )}
      <div className="review-files">
        {turn.files.map((file) => <DiffFile key={`${turn.id}:${file.path}`} file={file} cwd={cwd} mode={mode} expanded={expanded} />)}
      </div>
    </div>
  );
}

const DiffFile = memo(function DiffFile({ file, cwd, mode, expanded }: {
  file: ReviewFile; cwd: string; mode: 'unified' | 'split'; expanded: boolean;
}) {
  const [open, setOpen] = useState(expanded);
  useEffect(() => setOpen(expanded), [expanded]);
  return (
    <section className="diff-file">
      <button type="button" className="diff-file-heading" aria-expanded={open} onClick={() => setOpen(!open)} title={file.path}>
        <ChevronDown size={14} className={open ? '' : 'is-collapsed'} />
        <code>{displayPath(file.path, cwd)}</code>
        <span className="diff-stat"><span className="diff-added">+{file.added}</span><span className="diff-deleted">−{file.deleted}</span></span>
      </button>
      {open && (file.hunks.length === 0 ? (
        <div className="diff-unavailable">无文本差异</div>
      ) : (
        <div className="diff-content" tabIndex={0} role="region" aria-label={`${displayPath(file.path, cwd)} 的代码差异`}>
          {file.hunks.map((hunk, index) => (
            <div className="diff-hunk" key={index}>
              <div className="diff-hunk-header">{hunk.header}</div>
              {mode === 'split' ? splitDiffLines(hunk.lines).map((row, lineIndex) => (
                <div className="diff-split-row" key={lineIndex}>
                  <DiffSide line={row.left} side="old" /><DiffSide line={row.right} side="new" />
                </div>
              )) : hunk.lines.map((line, lineIndex) => (
                <div className={`diff-line diff-line--${line.type}`} key={lineIndex}>
                  <span className="diff-line-number">{line.oldLine}</span>
                  <span className="diff-line-number">{line.newLine}</span>
                  <span className="diff-line-sign">{line.type === 'add' ? '+' : line.type === 'delete' ? '−' : ' '}</span>
                  <code>{line.text || ' '}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
});

function DiffSide({ line, side }: { line: DiffLine | null; side: 'old' | 'new' }) {
  return (
    <div className={`diff-line diff-side${line ? ` diff-line--${line.type}` : ' diff-line--empty'}`}>
      <span className="diff-line-number">{side === 'old' ? line?.oldLine : line?.newLine}</span>
      <span className="diff-line-sign">{line?.type === 'add' ? '+' : line?.type === 'delete' ? '−' : ' '}</span>
      <code>{line?.text || ' '}</code>
    </div>
  );
}

function CommandDetail({ command }: { command: Extract<ThreadItem, { type: 'commandExecution' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="inspector-activity" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><TerminalSquare size={15} /><code title={command.command}>{command.command}</code></summary>
      {open && command.aggregatedOutput && <pre>{command.aggregatedOutput}</pre>}
    </details>
  );
}

function EmptyInspector({ text }: { text: string }) {
  return <div className="inspector-empty"><FileCode2 size={22} /><span>{text}</span></div>;
}

function displayPath(value: string, cwd: string): string {
  const normalized = value.replace(/\\/g, '/');
  const root = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.toLocaleLowerCase().startsWith(`${root.toLocaleLowerCase()}/`) ? normalized.slice(root.length + 1) : normalized;
}
