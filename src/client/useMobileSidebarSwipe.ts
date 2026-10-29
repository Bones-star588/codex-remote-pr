import { useEffect, useRef, type RefObject } from 'react';
import { SidebarSwipe, sidebarSwipeSettings } from './sidebar-swipe';

const excludedTargets = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .composer, pre, '
  + 'dialog, [role="dialog"], [role="menu"], .terminal-panel, .inspector, .inspector-backdrop, [data-sidebar-swipe-ignore]';

export function useMobileSidebarSwipe(rootRef: RefObject<HTMLElement | null>, mobile: boolean,
  open: boolean, onOpenChange: (open: boolean) => void) {
  const suppressClickUntil = useRef(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !mobile) return;
    const gesture = new SidebarSwipe();
    let touchId: number | null = null;
    const reset = () => { gesture.cancel(); touchId = null; };
    const start = (event: TouchEvent) => {
      reset();
      suppressClickUntil.current = 0;
      const touch = event.touches[0];
      const target = event.target;
      if (event.touches.length !== 1 || !touch || !(target instanceof Element) ||
        target.closest(excludedTargets) || root.ownerDocument.querySelector('dialog[open], [aria-modal="true"]') ||
        root.ownerDocument.getSelection()?.toString()) return;
      const eligible = !open || Boolean(target.closest('#workspace-sidebar, .mobile-backdrop'));
      if (gesture.begin(touch.clientX, touch.clientY, open, eligible)) {
        touchId = touch.identifier;
        console.debug('[mobile-sidebar] swipe started', { open, x: touch.clientX, y: touch.clientY });
      }
    };
    const move = (event: TouchEvent) => {
      if (touchId === null) return;
      const touch = Array.from(event.touches).find(value => value.identifier === touchId);
      if (event.touches.length !== 1 || !touch || !event.cancelable ||
        root.ownerDocument.getSelection()?.toString()) { reset(); return; }
      if (gesture.move(touch.clientX, touch.clientY)) {
        event.preventDefault();
        suppressClickUntil.current = Date.now() + sidebarSwipeSettings.clickSuppressionMs;
      }
    };
    const end = (event: TouchEvent) => {
      if (touchId === null) return;
      const touch = Array.from(event.changedTouches).find(value => value.identifier === touchId);
      if (!touch) return;
      gesture.move(touch.clientX, touch.clientY);
      const result = gesture.finish();
      touchId = null;
      if (result.consumed) {
        if (event.cancelable) event.preventDefault();
        suppressClickUntil.current = Date.now() + sidebarSwipeSettings.clickSuppressionMs;
      }
      console.debug('[mobile-sidebar] swipe finished', { fromOpen: open, ...result });
      if (result.open !== null) onOpenChange(result.open);
    };
    const cancel = () => { reset(); };
    const click = (event: MouseEvent) => {
      if (event.detail !== 0 && Date.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    root.addEventListener('touchstart', start, { passive: true, capture: true });
    root.addEventListener('touchmove', move, { passive: false, capture: true });
    root.addEventListener('touchend', end, { passive: false, capture: true });
    root.addEventListener('touchcancel', cancel, { passive: true, capture: true });
    root.addEventListener('click', click, true);
    return () => {
      reset();
      root.removeEventListener('touchstart', start, true);
      root.removeEventListener('touchmove', move, true);
      root.removeEventListener('touchend', end, true);
      root.removeEventListener('touchcancel', cancel, true);
      root.removeEventListener('click', click, true);
    };
  }, [rootRef, mobile, open, onOpenChange]);
}
