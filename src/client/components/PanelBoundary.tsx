import { RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';

export class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="panel-load-error" role="alert">
      <span>页面资源加载失败，请重新加载</span>
      <button type="button" className="icon-button" aria-label="重新加载页面" title="重新加载页面"
        onClick={() => window.location.reload()}><RefreshCw size={18} /></button>
    </div>;
  }
}
