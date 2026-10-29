import { CircleAlert, CircleCheck, CirclePause, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { hostNow } from '../host-clock';
import { goalElapsedMs, goalStatusLabel } from '../goal';
import type { ThreadGoal } from '../types';
import { formatWorkDuration } from '../../shared/turn-timing';

export function GoalStatus({ goal }: { goal: ThreadGoal | null }) {
  const [now, setNow] = useState(hostNow);
  useEffect(() => {
    if (goal?.status !== 'active') return;
    const timer = window.setInterval(() => setNow(hostNow()), 1000);
    return () => window.clearInterval(timer);
  }, [goal?.status, goal?.updatedAt]);
  if (!goal) return null;
  const Icon = goal.status === 'active' ? LoaderCircle
    : goal.status === 'complete' ? CircleCheck
      : goal.status === 'paused' ? CirclePause : CircleAlert;
  const duration = formatWorkDuration(goalElapsedMs(goal, now));
  return (
    <div className={`goal-status goal-status--${goal.status}`} role="status" aria-live="polite">
      <Icon size={15} className={goal.status === 'active' ? 'spin' : undefined} aria-hidden="true" />
      <div className="goal-status-copy">
        <strong>{goalStatusLabel(goal.status)}</strong>
        <span title={goal.objective}>{goal.objective}</span>
      </div>
      <span className="goal-status-duration">持续 {duration}</span>
    </div>
  );
}
