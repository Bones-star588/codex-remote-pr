import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sidebar } from './Sidebar';
import type { RemoteState } from '../useRemote';

const noop = () => {};
const remote = {
  threads: [], projects: [], serverRequests: [], threadsLoading: false,
  showArchived: false, status: 'connected'
} as unknown as RemoteState;

describe('conversation sidebar navigation', () => {
  it.each(['desktop', 'mobile'] as const)('keeps useful navigation with a plain title on %s', layout => {
    const html = renderToStaticMarkup(createElement(Sidebar, {
      remote, layout, activeThreadId: null, open: true, collapsed: false, search: '',
      onSearchChange: noop, onClose: noop, onToggleCollapse: noop,
      onNewTask: noop, onSelectThread: noop, onLogout: noop
    }));
    expect(html).toContain('<div class="sidebar-product"><strong>Codex</strong></div>');
    expect(html).not.toContain('Codex 菜单');
    expect(html).not.toContain('aria-label="帮助"');
    expect(html).not.toContain('developers.openai.com');
    expect(html).toContain('aria-label="设置" aria-haspopup="menu"');
    expect(html).toContain('aria-label="搜索任务"');
    expect(html).toContain('新聊天');
    expect(html).toContain('aria-label="添加工作区"');
  });
});


describe('running conversation indicator', () => {
  it.each(['desktop', 'mobile'] as const)('keeps running, idle and approval states distinct on %s', layout => {
    const thread = { id: 'synthetic', name: 'Synthetic task', cwd: '/project', status: { type: 'active' } };
    const render = (status: string, attention = false) => renderToStaticMarkup(createElement(Sidebar, {
      remote: { ...remote, threads: [{ ...thread, status: { type: status } }],
        serverRequests: attention ? [{ params: { threadId: thread.id } }] : [] } as unknown as RemoteState,
      layout, activeThreadId: null, open: true, collapsed: false, search: '',
      onSearchChange: noop, onClose: noop, onToggleCollapse: noop,
      onNewTask: noop, onSelectThread: noop, onLogout: noop
    }));
    const running = render('active');
    expect(running).toContain('class="thread-running-spinner"');
    expect(running).toContain('aria-hidden="true"');
    expect(render('idle')).not.toContain('thread-running-spinner');
    const attention = render('active', true);
    expect(attention).not.toContain('thread-running-spinner');
    expect(attention).toContain('等待审批：');
  });
});
