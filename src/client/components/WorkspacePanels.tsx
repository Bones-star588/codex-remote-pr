import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  clampPanelWidth, defaultPanelWidths, fitPanelWidths, panelMinimums, panelWidthMaximum,
  type PanelSide, type PanelWidths
} from '../panel-layout';
import { useMobileViewport } from '../useMobileViewport';

const storageKey = 'workspace-panel-widths';

function readWidths(): PanelWidths {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<PanelWidths>;
    return {
      sidebar: Number.isFinite(stored.sidebar) ? stored.sidebar! : defaultPanelWidths.sidebar,
      inspector: Number.isFinite(stored.inspector) ? stored.inspector! : defaultPanelWidths.inspector
    };
  } catch {
    return { ...defaultPanelWidths };
  }
}

interface WorkspacePanelsProps {
  children: ReactNode;
  layout: 'desktop' | 'mobile';
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  mobileGlass: boolean;
}

export function WorkspacePanels({ children, layout, sidebarCollapsed, inspectorOpen, mobileGlass }: WorkspacePanelsProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  useMobileViewport(shellRef, layout === 'mobile');
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [preferred, setPreferred] = useState(readWidths);
  const preferredRef = useRef(preferred);
  const dragRef = useRef<{
    side: PanelSide;
    pointerId: number;
    element: HTMLDivElement;
    startX: number;
    startWidth: number;
    original: PanelWidths;
    maximum: number;
  } | null>(null);
  const pendingRef = useRef<PanelWidths | null>(null);
  const frameRef = useRef<number | null>(null);
  const widths = fitPanelWidths(preferred, viewport, sidebarCollapsed, inspectorOpen);

  function update(next: PanelWidths, persist = false) {
    preferredRef.current = next;
    setPreferred(next);
    if (persist) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep resizing available without storage. */ }
    }
  }

  function finish(cancel = false) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    update(cancel ? drag.original : pendingRef.current ?? preferredRef.current, !cancel);
    pendingRef.current = null;
    document.documentElement.classList.remove('is-resizing-panels');
    if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
  }

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport(entry.contentRect.width);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    finish(true);
  }, [layout, sidebarCollapsed, inspectorOpen, viewport]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    document.documentElement.classList.remove('is-resizing-panels');
  }, []);

  function start(side: PanelSide, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      side, pointerId: event.pointerId, element: event.currentTarget,
      startX: event.clientX, startWidth: widths[side], original: preferredRef.current,
      maximum: panelWidthMaximum(side, widths, viewport, sidebarCollapsed, inspectorOpen)
    };
    document.documentElement.classList.add('is-resizing-panels');
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = (event.clientX - drag.startX) * (drag.side === 'sidebar' ? 1 : -1);
    pendingRef.current = {
      ...preferredRef.current,
      [drag.side]: clampPanelWidth(drag.startWidth + delta, panelMinimums[drag.side], drag.maximum)
    };
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (pendingRef.current) update(pendingRef.current);
    });
  }

  function keydown(side: PanelSide, event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && dragRef.current) {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const maximum = panelWidthMaximum(side, widths, viewport, sidebarCollapsed, inspectorOpen);
    const direction = (event.key === 'ArrowRight' ? 1 : -1) * (side === 'sidebar' ? 1 : -1);
    const value = event.key === 'Home' ? panelMinimums[side] : event.key === 'End' ? maximum :
      widths[side] + direction * (event.shiftKey ? 50 : 10);
    update({ ...preferredRef.current, [side]: clampPanelWidth(value, panelMinimums[side], maximum) }, true);
  }

  const style = {
    '--sidebar-width': `${widths.sidebar}px`,
    '--review-width': `${widths.inspector}px`
  } as CSSProperties;

  return (
    <div ref={shellRef} className="app-shell" data-layout={layout} data-mobile-glass={mobileGlass} style={style}>
      {children}
      {layout === 'desktop' && (['sidebar', 'inspector'] as const).map((side) => (
        (side === 'sidebar' ? !sidebarCollapsed : inspectorOpen) && (
          <div key={side} className={`panel-resizer panel-resizer--${side}`}
            role="separator" tabIndex={0} aria-orientation="vertical"
            aria-label={side === 'sidebar' ? '调整项目栏宽度' : '调整检查器宽度'}
            aria-controls={side === 'sidebar' ? 'workspace-sidebar' : 'workspace-inspector'}
            aria-valuemin={panelMinimums[side]}
            aria-valuemax={panelWidthMaximum(side, widths, viewport, sidebarCollapsed, inspectorOpen)}
            aria-valuenow={widths[side]} aria-valuetext={`${widths[side]} 像素`}
            title="拖动调整宽度，双击恢复默认"
            onPointerDown={(event) => start(side, event)} onPointerMove={move}
            onPointerUp={() => finish()} onPointerCancel={() => finish(true)}
            onLostPointerCapture={() => finish()}
            onKeyDown={(event) => keydown(side, event)}
            onDoubleClick={() => update({ ...preferredRef.current, [side]: defaultPanelWidths[side] }, true)}
          />
        )
      ))}
    </div>
  );
}
