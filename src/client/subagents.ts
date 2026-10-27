import type { SubagentStatus, Thread, ThreadItem } from './types';
import type { TurnTiming } from '../shared/turn-timing';

export interface Subagent {
  threadId: string;
  name: string;
  role?: string;
  status?: SubagentStatus;
  prompt?: string;
  model?: string;
  effort?: string;
  archived?: boolean;
}

export function subagentSource(thread: Thread): {
  parent_thread_id: string; agent_path?: string | null; agent_nickname?: string | null; agent_role?: string | null;
} | null {
  const source = thread.source as { subAgent?: { thread_spawn?: { parent_thread_id: string } } } | null;
  return source && typeof source === 'object' && typeof source.subAgent === 'object'
    ? source.subAgent?.thread_spawn ?? null : null;
}

export function isSubagentItem(item: ThreadItem): boolean {
  return item.type === 'collabAgentToolCall' || item.type === 'subAgentActivity';
}

export function collectSubagents(items: ThreadItem[], threads: Thread[] = [], parentId?: string): Subagent[] {
  const agents = new Map<string, Subagent>();
  const ensure = (id: string) => {
    let agent = agents.get(id);
    if (!agent) { agent = { threadId: id, name: `子智能体 ${agents.size + 1}` }; agents.set(id, agent); }
    return agent;
  };
  for (const item of items) {
    if (item.type === 'subAgentActivity') {
      const agent = ensure(item.agentThreadId);
      if (item.agentPath) agent.name = item.agentPath.split('/').filter(Boolean).at(-1) || agent.name;
      if (item.kind === 'started') agent.status = 'running';
      if (item.kind === 'interrupted') agent.status = 'interrupted';
      if (item.kind === 'completed') agent.status = 'completed';
      if (item.model) agent.model = item.model;
      if (item.reasoningEffort) agent.effort = item.reasoningEffort;
    } else if (item.type === 'collabAgentToolCall') {
      const ids = new Set([...item.receiverThreadIds, ...Object.keys(item.agentsStates ?? {})]);
      for (const id of ids) {
        const agent = ensure(id);
        const state = item.agentsStates?.[id];
        if (state) agent.status = state.status;
        else if (item.tool === 'spawnAgent' && !agent.status) agent.status = 'pendingInit';
        if (item.prompt && ['spawnAgent', 'sendInput', 'followupTask'].includes(item.tool)) agent.prompt = item.prompt;
        if (item.model) agent.model = item.model;
        if (item.reasoningEffort) agent.effort = item.reasoningEffort;
      }
    }
  }
  for (const thread of new Map(threads.map(thread => [thread.id, thread])).values()) {
    const source = subagentSource(thread);
    if (!agents.has(thread.id) && (!parentId || source?.parent_thread_id !== parentId)) continue;
    const agent = ensure(thread.id);
    agent.name = thread.agentNickname || source?.agent_nickname || source?.agent_path?.split('/').filter(Boolean).at(-1) || agent.name;
    const role = thread.agentRole || source?.agent_role;
    if (role) agent.role = role;
    if (thread.model) agent.model = thread.model;
    if (thread.reasoningEffort) agent.effort = thread.reasoningEffort;
    if (thread.archived) agent.archived = true;
    if (thread.status.type === 'active') agent.status = 'running';
    if (thread.status.type === 'systemError') agent.status = 'errored';
  }
  return [...agents.values()];
}

export function subagentStatusLabel(status: SubagentStatus | undefined): string {
  return status ? {
    pendingInit: '正在启动', running: '运行中', interrupted: '已中断', completed: '已完成',
    errored: '出错', shutdown: '已关闭', notFound: '不可用'
  }[status] : '';
}

export function subagentChatStatus(chat: {
  activeTurnId: string | null; timings: Record<string, TurnTiming>; thread?: Thread; agent: Subagent;
}): SubagentStatus | undefined {
  if (chat.activeTurnId || chat.thread?.status.type === 'active') return 'running';
  if (chat.agent.status === 'shutdown') return 'shutdown';
  if (chat.thread?.status.type === 'systemError') return 'errored';
  const latest = Object.values(chat.timings).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
  if (latest) return latest.status === 'inProgress' ? 'running' : latest.status === 'failed' ? 'errored'
    : latest.status === 'interrupted' ? 'interrupted' : 'completed';
  return chat.agent.status;
}
