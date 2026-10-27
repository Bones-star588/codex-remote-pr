import { Bot, Check, ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react';
import { createContext, useContext, useMemo } from 'react';
import { collectSubagents, subagentStatusLabel, type Subagent } from '../subagents';
import type { SubagentStatus, Thread, ThreadItem } from '../types';

export const SubagentsContext = createContext<{
  threads: Thread[]; open: (agent: Subagent) => void; states?: Record<string, SubagentStatus | undefined>;
}>({ threads: [], open: () => {} });

export function SubagentRows({ items, parentId, agents: supplied }: {
  items?: ThreadItem[]; parentId?: string; agents?: Subagent[];
}) {
  const { threads, open, states } = useContext(SubagentsContext);
  const agents = useMemo(() => (supplied ?? collectSubagents(items ?? [], threads, parentId))
    .map(agent => states?.[agent.threadId] ? { ...agent, status: states[agent.threadId]! } : agent),
    [items, threads, parentId, supplied, states]);
  const starting = (items ?? []).filter(item => item.type === 'collabAgentToolCall' && item.tool === 'spawnAgent' &&
    !item.receiverThreadIds.length && !Object.keys(item.agentsStates ?? {}).length &&
    (item.status === 'inProgress' || item.status === 'failed' || item.status === 'interrupted'));
  if (!agents.length && !starting.length) return null;
  return <div className="subagent-list" aria-label="子智能体">
    {starting.map(item => <div key={item.id} className="subagent-row" role="status">
      {'status' in item && item.status === 'inProgress'
        ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
      <span>{'status' in item && item.status === 'inProgress' ? '正在启动子智能体'
        : 'status' in item && item.status === 'interrupted' ? '子智能体启动已中断' : '子智能体启动失败'}</span>
    </div>)}
    {agents.map(agent => <button type="button" className="subagent-row" key={agent.threadId}
      aria-label={`查看子智能体 ${agent.name}`} title={agent.prompt || agent.name} onClick={() => open(agent)}>
      <Bot size={16} aria-hidden="true" />
      <span className="subagent-name">{agent.name}</span>
      {agent.role && <span className="subagent-role">{agent.role}</span>}
      <span className={`subagent-status subagent-status--${agent.status ?? 'unknown'}`}>
        <SubagentStatusIcon status={agent.status} />
        {subagentStatusLabel(agent.status)}
      </span>
      <ChevronRight size={14} aria-hidden="true" />
    </button>)}
  </div>;
}

export function SubagentStatusIcon({ status }: { status: Subagent['status'] }) {
  return status === 'running' || status === 'pendingInit' ? <LoaderCircle size={12} className="spin" aria-hidden="true" />
    : status === 'completed' ? <Check size={13} aria-hidden="true" />
    : status === 'errored' || status === 'notFound' ? <CircleAlert size={13} aria-hidden="true" /> : null;
}
