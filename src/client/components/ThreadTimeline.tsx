import {
  BrainCircuit,
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FoldVertical,
  FileCode2,
  Globe2,
  Image,
  LoaderCircle,
  MessageSquareText,
  Play,
  TerminalSquare
} from 'lucide-react';
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { localImageSource } from '../markdown-media';
import { itemKey } from '../remote-state';
import type { ThreadItem } from '../types';
import { buildTimelineEntries, isActivityIssue, type TimelineEntry } from '../timeline-model';
import { userMessageText } from '../user-message';
import { ImagePreview } from './ImagePreview';

interface ThreadTimelineProps {
  threadId: string;
  items: ThreadItem[];
  loading: boolean;
  activeTurnId: string | null;
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  onLoadEarlier: () => Promise<void>;
}

const INITIAL_ACTIVITY_ITEMS = 60;
const ACTIVITY_PAGE_ITEMS = 120;

export function ThreadTimeline({
  threadId,
  items,
  loading,
  activeTurnId,
  hasMoreHistory,
  loadingHistory,
  onLoadEarlier
}: ThreadTimelineProps) {
  const streamRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const initialScrollReadyRef = useRef(false);
  const loadingEarlierRef = useRef(false);
  const prependAdjustmentRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const entries = useMemo(() => buildTimelineEntries(items, activeTurnId), [items, activeTurnId]);
  const preserveActivityPosition = useCallback(() => {
    stickToBottomRef.current = false;
    window.requestAnimationFrame(() => {
      const stream = streamRef.current;
      if (!stream) return;
      const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 140;
      stickToBottomRef.current = nearBottom;
      setAwayFromBottom(!nearBottom);
    });
  }, []);
  const loadEarlier = useCallback(() => {
    if (!hasMoreHistory || loadingEarlierRef.current) return;
    const stream = streamRef.current;
    if (stream) {
      prependAdjustmentRef.current = { scrollHeight: stream.scrollHeight, scrollTop: stream.scrollTop };
    }
    loadingEarlierRef.current = true;
    void onLoadEarlier().finally(() => { loadingEarlierRef.current = false; });
  }, [hasMoreHistory, onLoadEarlier]);

  useLayoutEffect(() => {
    if (loading && items.length === 0) return;
    stickToBottomRef.current = true;
    const stream = streamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
    let frame = window.requestAnimationFrame(() => {
      if (stream) stream.scrollTop = stream.scrollHeight;
      frame = window.requestAnimationFrame(() => { initialScrollReadyRef.current = true; });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, threadId]);

  useEffect(() => {
    const inner = innerRef.current;
    if (loading || !inner) return;
    const observer = new ResizeObserver(() => {
      const stream = streamRef.current;
      if (stream && stickToBottomRef.current) stream.scrollTop = stream.scrollHeight;
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [loading, threadId]);

  useLayoutEffect(() => {
    if (loading) return;
    const stream = streamRef.current;
    if (!stream) return;
    if (stickToBottomRef.current) {
      stream.scrollTop = stream.scrollHeight;
      stickToBottomRef.current = true;
    }
  }, [items, loading]);

  useLayoutEffect(() => {
    const stream = streamRef.current;
    const previous = prependAdjustmentRef.current;
    if (!stream || !previous) return;
    stream.scrollTop = previous.scrollTop + (stream.scrollHeight - previous.scrollHeight);
    prependAdjustmentRef.current = null;
  }, [items.length]);

  useEffect(() => {
    if (!loadingHistory) loadingEarlierRef.current = false;
  }, [loadingHistory]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stream = streamRef.current;
      if (!loading && !loadingHistory && stream && stream.scrollTop < 80) loadEarlier();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items.length, loadEarlier, loading, loadingHistory]);

  if (loading && items.length === 0) {
    return (
      <div className="message-stream message-stream--loading" aria-label="正在加载任务">
        <div className="message-skeleton message-skeleton--short" />
        <div className="message-skeleton message-skeleton--long" />
        <div className="message-skeleton message-skeleton--medium" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="message-stream message-stream--empty">
        <div className="empty-thread-icon">
          <MessageSquareText size={22} aria-hidden="true" />
        </div>
        <h2>从第一条消息开始</h2>
      </div>
    );
  }

  return (
    <div className="timeline-shell">
    <div
      ref={streamRef}
      className="message-stream"
      aria-label="会话记录"
      onLoadCapture={() => {
        const stream = streamRef.current;
        if (stream && stickToBottomRef.current) stream.scrollTop = stream.scrollHeight;
      }}
      onScroll={(event) => {
        if (!initialScrollReadyRef.current) return;
        const stream = event.currentTarget;
        stickToBottomRef.current =
          stream.scrollHeight - stream.scrollTop - stream.clientHeight < 140;
        setAwayFromBottom(!stickToBottomRef.current);
        if (initialScrollReadyRef.current && stream.scrollTop < 80) loadEarlier();
      }}
    >
      <div className="message-stream-inner" ref={innerRef}>
      {hasMoreHistory && (
        <button type="button" className="history-trim" disabled={loadingHistory} onClick={loadEarlier}>
          {loadingHistory ? '正在加载' : '显示更早记录'}
        </button>
      )}
      {entries.map((entry) =>
        entry.type === 'activity' ? (
          <ActivityGroup entry={entry} onInteract={preserveActivityPosition} key={entry.key} />
        ) : entry.type === 'event' ? (
          <ActivityItem item={entry.item} running={false} key={entry.key} />
        ) : (
          <MessageItem item={entry.item} workedMs={entry.workedMs} key={entry.key} />
        )
      )}
      {activeTurnId && !entries.some((entry) => entry.type === 'activity' && entry.running) && (
        <div className="working-indicator">
          <LoaderCircle size={14} className="spin" aria-hidden="true" />
          <span>Codex 正在处理</span>
        </div>
      )}
      </div>
    </div>
    {awayFromBottom && (
      <button
        type="button"
        className="jump-to-latest icon-button"
        aria-label="回到最新消息"
        title="回到最新消息"
        onClick={() => {
          const stream = streamRef.current;
          if (stream) stream.scrollTop = stream.scrollHeight;
          stickToBottomRef.current = true;
          setAwayFromBottom(false);
        }}
      >
        <ArrowDown size={17} />
      </button>
    )}
    </div>
  );
}

const MessageItem = memo(function MessageItem({ item, workedMs }: { item: ThreadItem; workedMs?: number | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (item.type === 'userMessage') {
    const text = (item.content ?? []).filter((entry) => entry.type === 'text')
      .map((entry) => userMessageText(entry.text ?? '')).filter(Boolean).join('\n\n');
    const long = text.length > 900;
    return (
      <article className="message message--user">
        <div className="user-message-body">
          {text && <div className="user-message-text">{long && !expanded ? `${text.slice(0, 800)}...` : text}</div>}
          {(item.content ?? []).filter((entry) => entry.type === 'image' || entry.type === 'localImage').map((entry, index) => (
            <ImagePreview key={index} src={localImageSource(entry.path ?? entry.url)} alt="附件" />
          ))}
          {long && (
            <button type="button" className="message-expand" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? '收起消息' : '展开消息'}
            </button>
          )}
        </div>
      </article>
    );
  }

  if (item.type === 'agentMessage') {
    return (
      <article className={`message message--agent${item.phase === 'commentary' ? ' message--commentary' : ''}`}>
        {workedMs !== undefined && (
          <div className="worked-divider"><span>{workedMs === null ? '已完成' : `用时 ${formatDuration(workedMs)}`}</span></div>
        )}
        <div className="agent-message-body markdown">
          <MarkdownText text={item.text} />
        </div>
      </article>
    );
  }

  return null;
});

const ActivityGroup = memo(function ActivityGroup({
  entry,
  onInteract
}: {
  entry: Extract<TimelineEntry, { type: 'activity' }>;
  onInteract: () => void;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const [visibleCount, setVisibleCount] = useState(INITIAL_ACTIVITY_ITEMS);
  const issueCount = entry.failedCount + entry.declinedCount;
  const { label, Icon } = activityPresentation(entry);
  const filteredItems = useMemo(
    () => filter === 'issues' ? entry.items.filter(isActivityIssue) : entry.items,
    [entry.items, filter]
  );
  const hiddenCount = Math.max(0, filteredItems.length - visibleCount);
  const visibleItems = hiddenCount > 0 ? filteredItems.slice(-visibleCount) : filteredItems;
  const issueLabel = [
    entry.failedCount > 0 ? `${entry.failedCount} 条失败` : '',
    entry.declinedCount > 0 ? `${entry.declinedCount} 条已拒绝` : ''
  ].filter(Boolean).join('，');
  const selectFilter = (value: 'all' | 'issues') => {
    setFilter(value);
    setVisibleCount(INITIAL_ACTIVITY_ITEMS);
  };

  return (
    <section className={`activity-group${open ? ' activity-group--open' : ''}`} onClick={onInteract}>
      <div className="activity-group-header">
        <button
          type="button"
          className="activity-group-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          {entry.running
            ? <LoaderCircle size={15} className="spin" aria-hidden="true" />
            : <Icon size={15} aria-hidden="true" />}
          <span className="activity-group-label">{label}</span>
          <ChevronDown size={13} className="summary-chevron" aria-hidden="true" />
        </button>
        {issueCount > 0 && (
          <button
            type="button"
            className="activity-group-issues"
            title={issueLabel}
            aria-label={`查看异常记录：${issueLabel}`}
            aria-controls={bodyId}
            onClick={() => { selectFilter('issues'); setOpen(true); }}
          >
            <CircleAlert size={13} aria-hidden="true" />
            <span>{issueCount} 项异常</span>
          </button>
        )}
      </div>
      {open && (
        <div className="activity-group-body" id={bodyId}>
          {issueCount > 0 && (
            <div className="activity-filters" role="group" aria-label="筛选执行记录">
              <button type="button" aria-pressed={filter === 'all'} onClick={() => selectFilter('all')}>
                全部 <span>{entry.items.length}</span>
              </button>
              <button type="button" aria-pressed={filter === 'issues'} title={issueLabel} onClick={() => selectFilter('issues')}>
                异常 <span>{issueCount}</span>
              </button>
            </div>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="activity-group-more"
              onClick={() => setVisibleCount((current) => current + ACTIVITY_PAGE_ITEMS)}
            >
              显示更早的记录（{hiddenCount}）
            </button>
          )}
          {visibleItems.map((item) => (
            <ActivityItem item={item} running={entry.running} key={itemKey(item)} />
          ))}
        </div>
      )}
    </section>
  );
}, (previous, next) =>
  previous.entry.running === next.entry.running &&
  previous.entry.failedCount === next.entry.failedCount &&
  previous.entry.declinedCount === next.entry.declinedCount &&
  previous.onInteract === next.onInteract &&
  previous.entry.items.length === next.entry.items.length &&
  previous.entry.items.every((item, index) => item === next.entry.items[index])
);

function activityPresentation(entry: Extract<TimelineEntry, { type: 'activity' }>) {
  const count = entry.items.length;
  switch (entry.kind) {
    case 'command':
      return { Icon: TerminalSquare, label: entry.running ? '正在运行命令' :
        entry.declinedCount === count ? '命令执行' : count > 1 ? `运行了 ${count} 条命令` : '运行了命令' };
    case 'file': {
      const paths = new Set(entry.items.flatMap((item) =>
        item.type === 'fileChange' && item.status === 'completed' ? item.changes.map((change) => change.path) : []));
      return { Icon: FileCode2, label: entry.running ? '正在编辑文件' :
        paths.size === 0 ? '文件编辑' : paths.size > 1 ? `编辑了 ${paths.size} 个文件` : '编辑了文件' };
    }
    case 'reasoning': return { Icon: BrainCircuit, label: entry.running ? '正在思考' : '思考过程' };
    case 'search': return { Icon: Globe2, label: entry.running ? '正在搜索网页' : '搜索了网页' };
    case 'image': return { Icon: Image, label: entry.running ? '正在查看图片' : '查看了图片' };
    case 'tool': return { Icon: TerminalSquare, label: entry.running ? '正在调用工具' :
      count > 1 ? `进行了 ${count} 次工具调用` : '调用了工具' };
  }
}

const ActivityItem = memo(function ActivityItem({ item, running }: { item: ThreadItem; running: boolean }) {
  const [open, setOpen] = useState(false);
  const status = 'status' in item
    ? item.status === 'inProgress' && !running ? 'ended' : item.status
    : undefined;
  const detailProps = { onToggle: (event: React.SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open) };
  if (item.type === 'agentMessage') {
    return <div className="activity-commentary markdown"><MarkdownText text={item.text} /></div>;
  }
  if (item.type === 'reasoning') {
    return (
      <details className="activity-row activity-row--reasoning" {...detailProps}>
        <summary>
          <BrainCircuit size={15} aria-hidden="true" />
          <span>推理过程</span>
          <ChevronDown size={14} className="summary-chevron" aria-hidden="true" />
        </summary>
        {open && <div className="activity-body reasoning-body">
          {[...item.summary, ...item.content].map((part, index) => (
            <p key={index}>{part}</p>
          ))}
        </div>}
      </details>
    );
  }

  if (item.type === 'commandExecution') {
    return (
      <details className="activity-row" {...detailProps}>
        <summary>
          {status === 'inProgress' ? (
            <LoaderCircle size={15} className="spin" aria-hidden="true" />
          ) : status === 'failed' ? (
            <CircleAlert size={15} aria-hidden="true" />
          ) : (
            <TerminalSquare size={15} aria-hidden="true" />
          )}
          <span className="activity-command-preview" title={item.command}>{item.command.trim().replace(/\s+/g, ' ') || '命令执行'}</span>
          <StatusBadge status={status!} />
          <ChevronDown size={14} className="summary-chevron" aria-hidden="true" />
        </summary>
        {open && <div className="activity-body">
          <pre className="command-block">{item.command}</pre>
          {item.aggregatedOutput && <pre className="output-block">{item.aggregatedOutput}</pre>}
          {(item.exitCode !== null || item.durationMs !== null) && (
            <div className="activity-meta">
              {item.exitCode !== null && <span>Exit {item.exitCode}</span>}
              {item.durationMs !== null && <span>{formatDuration(item.durationMs)}</span>}
            </div>
          )}
        </div>}
      </details>
    );
  }

  if (item.type === 'fileChange') {
    return (
      <details className="activity-row" {...detailProps}>
        <summary>
          {item.status === 'completed' ? (
            <CheckCircle2 size={15} aria-hidden="true" />
          ) : (
            <FileCode2 size={15} aria-hidden="true" />
          )}
          <span>文件变更</span>
          <StatusBadge status={status!} />
          <ChevronDown size={14} className="summary-chevron" aria-hidden="true" />
        </summary>
        {open && <div className="activity-body file-list">
          {item.changes?.map((change, index) => (
            <div className="file-change" key={`${change.path}-${index}`}>
              <code>{change.path}</code>
              {change.diff && <pre className="output-block">{change.diff}</pre>}
            </div>
          ))}
        </div>}
      </details>
    );
  }

  if (item.type === 'plan') {
    return (
      <div className="plan-row">
        <Play size={15} aria-hidden="true" />
        <div>
          <strong>执行计划</strong>
          <p>{item.text}</p>
        </div>
      </div>
    );
  }

  if (item.type === 'mcpToolCall') {
    return (
      <details className="activity-row" {...detailProps}>
        <summary>
          <TerminalSquare size={15} aria-hidden="true" />
          <span>{item.server}/{item.tool}</span>
          <StatusBadge status={status!} />
          <ChevronDown size={14} className="summary-chevron" aria-hidden="true" />
        </summary>
        {open && <div className="activity-body">
          <pre className="output-block">{JSON.stringify(item.result ?? item.error ?? item.arguments, null, 2)}</pre>
        </div>}
      </details>
    );
  }

  if (item.type === 'dynamicToolCall') {
    return (
      <details className="activity-row" {...detailProps}>
        <summary>
          <TerminalSquare size={15} aria-hidden="true" />
          <span>{item.tool}</span>
          <StatusBadge status={status!} />
          <ChevronDown size={14} className="summary-chevron" aria-hidden="true" />
        </summary>
        {open && <div className="activity-body">
          <pre className="output-block">{JSON.stringify(item.contentItems ?? item.arguments, null, 2)}</pre>
        </div>}
      </details>
    );
  }

  if (item.type === 'webSearch') {
    return (
      <div className="activity-row activity-row--static">
        <Globe2 size={15} aria-hidden="true" />
        <span>网页搜索</span>
        {item.query && <code>{item.query}</code>}
      </div>
    );
  }

  if (item.type === 'imageView') {
    return (
      <figure className="activity-image">
        <ImagePreview src={localImageSource(item.path)} />
      </figure>
    );
  }

  if (item.type === 'imageGeneration') {
    return (
      <div className="activity-row activity-row--static">
        <Image size={15} aria-hidden="true" />
        <span>图片生成</span>
      </div>
    );
  }

  if (item.type === 'contextCompaction') {
    return (
      <div className="context-divider">
        <FoldVertical size={15} aria-hidden="true" />
        <span>上下文已自动压缩</span>
      </div>
    );
  }

  return null;
});

const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) =>
        localImageSource(url).startsWith('/api/local-image?') ? url : defaultUrlTransform(url)
      }
      components={{
        a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        img: ({ src, alt }) => (
          <ImagePreview src={localImageSource(typeof src === 'string' ? src : undefined)} alt={alt ?? ''} />
        )
      }}
    >
      {text}
    </ReactMarkdown>
  );
});

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return null;
  return <span className={`status-badge status-badge--${status}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'inProgress':
      return '运行中';
    case 'completed':
      return '完成';
    case 'failed':
      return '失败';
    case 'declined':
      return '已拒绝';
    case 'ended':
      return '已结束';
    default:
      return status;
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1000)}s`;
}
