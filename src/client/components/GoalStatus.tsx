import { CircleAlert, CircleCheck, CirclePause, LoaderCircle, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { hostNow } from '../host-clock';
import { goalElapsedMs, goalStatusLabel, type GoalUpdate } from '../goal';
import type { ThreadGoal } from '../types';
import { formatWorkDuration } from '../../shared/turn-timing';

export function GoalStatus({ goal, disabled = true, onUpdate, onDelete, onError = console.error }: {
  goal: ThreadGoal | null;
  disabled?: boolean;
  onUpdate?: (update: GoalUpdate) => Promise<void>;
  onDelete?: () => Promise<void>;
  onError?: (error: unknown) => void;
}) {
  const [now, setNow] = useState(hostNow);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [objective, setObjective] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (goal?.status !== 'active') return;
    setNow(hostNow());
    const timer = window.setInterval(() => setNow(hostNow()), 1000);
    return () => window.clearInterval(timer);
  }, [goal?.status, goal?.updatedAt]);
  useEffect(() => { setEditing(false); setDeleting(false); }, [goal?.threadId]);
  if (!goal) return null;
  const Icon = goal.status === 'active' ? LoaderCircle
    : goal.status === 'complete' ? CircleCheck
      : goal.status === 'paused' ? CirclePause : CircleAlert;
  const duration = formatWorkDuration(goalElapsedMs(goal, now));
  const controlsDisabled = disabled || busy;
  async function act(action: () => Promise<void>) {
    if (controlsDisabled) return;
    setBusy(true);
    try { await action(); setEditing(false); setDeleting(false); }
    catch (error) { console.warn('[thread-dock] goal action failed', error); onError(error); }
    finally { setBusy(false); }
  }
  return (
    <section className={`goal-status goal-status--${goal.status}`} aria-label="对话目标">
      <Icon size={15} className={goal.status === 'active' ? 'spin' : undefined} aria-hidden="true" />
      <div className="goal-status-copy" role="status" aria-live="polite">
        <div className="goal-status-heading"><strong>{goalStatusLabel(goal.status)}</strong>
          <span className="goal-status-duration">持续 {duration}</span></div>
        <span title={goal.objective}>{goal.objective}</span>
      </div>
      {(onUpdate || onDelete) && <div className="goal-status-actions">
        {onUpdate && <>
          <button type="button" className="icon-button" disabled={controlsDisabled}
            aria-label={goal.status === 'active' ? '暂停 Goal' : '开始 Goal'}
            title={goal.status === 'active' ? '暂停 Goal' : '开始 Goal'}
            onClick={() => void act(() => onUpdate({ status: goal.status === 'active' ? 'paused' : 'active' }))}>
            {busy ? <LoaderCircle size={15} className="spin" /> : goal.status === 'active' ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button type="button" className="icon-button" disabled={controlsDisabled} aria-label="编辑 Goal" title="编辑 Goal"
            onClick={() => { setObjective(goal.objective); setEditing(value => !value); setDeleting(false); }}><Pencil size={15} /></button>
        </>}
        {onDelete && <button type="button" className="icon-button" disabled={controlsDisabled} aria-label="删除 Goal" title="删除 Goal"
          onClick={() => { setDeleting(value => !value); setEditing(false); }}><Trash2 size={15} /></button>}
      </div>}
      {editing && onUpdate && <form className="goal-editor" onSubmit={event => {
        event.preventDefault(); if (objective.trim()) void act(() => onUpdate({ objective }));
      }}>
        <label htmlFor="goal-objective">目标内容</label>
        <textarea id="goal-objective" value={objective} onChange={event => setObjective(event.target.value)} rows={3} autoFocus disabled={controlsDisabled} />
        <div className="goal-editor-actions"><button type="button" disabled={busy} onClick={() => setEditing(false)}>取消</button>
          <button type="submit" disabled={controlsDisabled || !objective.trim()}>保存</button></div>
      </form>}
      {deleting && onDelete && <div className="goal-editor" role="group" aria-label="确认删除目标">
        <span>删除此 Goal？</span><div className="goal-editor-actions">
          <button type="button" disabled={busy} onClick={() => setDeleting(false)}>取消</button>
          <button type="button" disabled={controlsDisabled} onClick={() => void act(onDelete)}>删除</button>
        </div></div>}
    </section>
  );
}
