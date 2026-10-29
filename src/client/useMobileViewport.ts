import { useLayoutEffect, type RefObject } from 'react';
import { mobileViewportGeometry } from './mobile-viewport';

/** Follow the visible viewport once; do not subtract the keyboard a second time. */
export function useMobileViewport(rootRef: RefObject<HTMLDivElement | null>, mobile: boolean) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !mobile) return;
    const viewport = window.visualViewport;
    let baselineHeight = window.innerHeight;
    let width = window.innerWidth;
    let frame = 0;
    let previousKeyboard: boolean | undefined;
    let dock: Element | null = null;
    const measure = () => {
      frame = 0;
      if (width !== window.innerWidth) {
        width = window.innerWidth;
        baselineHeight = window.innerHeight;
      }
      baselineHeight = Math.max(baselineHeight, window.innerHeight, viewport?.height ?? 0);
      const geometry = mobileViewportGeometry({
        layoutHeight: window.innerHeight, visibleHeight: viewport?.height ?? window.innerHeight,
        offsetTop: viewport?.offsetTop ?? 0, scale: viewport?.scale ?? 1, baselineHeight,
        editing: document.activeElement?.matches('textarea, input:not([type="button"]), [contenteditable="true"]') ?? false
      });
      root.style.setProperty('--mobile-viewport-height', `${geometry.height}px`);
      root.style.setProperty('--mobile-viewport-top', `${geometry.top}px`);
      root.dataset.keyboardOpen = String(geometry.keyboardOpen);
      if (previousKeyboard !== geometry.keyboardOpen) {
        console.debug('[mobile-layout] viewport changed', { ...geometry, baselineHeight });
        previousKeyboard = geometry.keyboardOpen;
      }
      const nextDock = root.querySelector('.thread-bottom, .home-composer-dock');
      if (nextDock !== dock) {
        if (dock) observer.unobserve(dock);
        dock = nextDock;
        if (dock) observer.observe(dock);
      }
      const dockHeight = dock?.getBoundingClientRect().height ?? 0;
      root.style.setProperty('--mobile-dock-height', `${Math.ceil(dockHeight)}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      for (const key of ['--mobile-viewport-height', '--mobile-viewport-top', '--mobile-dock-height']) root.style.removeProperty(key);
      delete root.dataset.keyboardOpen;
    };
  }, [rootRef, mobile]);
}
