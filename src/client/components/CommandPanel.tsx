import { Terminal, X } from 'lucide-react';
import { itemKey } from '../remote-state';
import type { ThreadItem } from '../types';

export function CommandPanel({ items, onClose }: { items: ThreadItem[]; onClose: () => void }) {
  const commands = items.filter((item) => item.type === 'commandExecution');
  return (
    <section className="command-panel" aria-label="命令记录">
      <header><span><Terminal size={15} />命令记录</span>
        <button type="button" className="icon-button" aria-label="关闭命令记录" title="关闭命令记录" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="command-panel-body">
        {commands.length === 0 && <span className="command-panel-empty">暂无命令记录</span>}
        {commands.map((command) => (
          <details key={itemKey(command)}>
            <summary><code>{command.command}</code></summary>
            <pre>{command.aggregatedOutput}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}
