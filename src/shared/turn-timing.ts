export interface TurnTiming {
  id: string;
  status: 'completed' | 'interrupted' | 'failed' | 'inProgress';
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
}

export function elapsedTurnMs(turn: TurnTiming, nowMs: number): number | null {
  if (turn.status !== 'inProgress' && turn.durationMs != null) return Math.max(0, turn.durationMs);
  if (turn.startedAt == null) return null;
  const endMs = turn.status === 'inProgress' ? nowMs : turn.completedAt == null ? null : turn.completedAt * 1000;
  return endMs == null ? null : Math.max(0, endMs - turn.startedAt * 1000);
}

export function formatWorkDuration(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}小时 ${minutes % 60}分钟 ${seconds % 60}秒`
    : minutes > 0 ? `${minutes}分钟 ${seconds % 60}秒` : `${seconds}秒`;
}
