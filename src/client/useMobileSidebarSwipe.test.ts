import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined, suppression: { current: 0 } }));
vi.mock('react', () => ({
  useRef: () => hooks.suppression,
  useEffect: (effect: () => (() => void) | undefined) => { hooks.cleanup = effect(); }
}));
import { useMobileSidebarSwipe } from './useMobileSidebarSwipe';

class Surface {
  listeners = new Map<string, (event: any) => void>();
  excluded = false;
  inSidebar = false;
  selection = '';
  modal = false;
  ownerDocument = {
    querySelector: () => this.modal ? {} : null,
    getSelection: () => this.selection
  };
  closest(selector: string) {
    return (selector.includes('#workspace-sidebar') ? this.inSidebar : this.excluded) ? this : null;
  }
  addEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type, listener); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  emit(type: string, x = 10, y = 100, extra = {}) {
    const touch = { identifier: 7, clientX: x, clientY: y };
    const event = { target: this, touches: [touch], changedTouches: [touch], cancelable: true,
      detail: 1, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
    this.listeners.get(type)?.(event);
    return event;
  }
}

beforeEach(() => {
  hooks.cleanup = undefined;
  hooks.suppression.current = 0;
  vi.stubGlobal('Element', Surface);
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => { hooks.cleanup?.(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mount(root: Surface, mobile = true, open = false, change = vi.fn()) {
  useMobileSidebarSwipe({ current: root as unknown as HTMLElement }, mobile, open, change);
  return change;
}

describe('mobile sidebar touch integration', () => {
  it('uses cancellable horizontal touch events to open and prevents the trailing click across state changes', () => {
    const root = new Surface();
    const change = mount(root);
    root.emit('touchstart');
    expect(root.emit('touchmove', 80).preventDefault).toHaveBeenCalled();
    expect(root.emit('touchend', 90).preventDefault).toHaveBeenCalled();
    expect(change).toHaveBeenCalledExactlyOnceWith(true);
    hooks.cleanup?.();
    mount(root, true, true, change);
    const click = root.emit('click');
    expect(click.preventDefault).toHaveBeenCalled();
    expect(click.stopPropagation).toHaveBeenCalled();
    expect(root.emit('click', 10, 100, { detail: 0 }).preventDefault).not.toHaveBeenCalled();
  });

  it('closes only from the sidebar or backdrop surface', () => {
    const root = new Surface();
    const change = mount(root, true, true);
    root.emit('touchstart', 220);
    root.emit('touchmove', 120);
    root.emit('touchend', 100);
    expect(change).not.toHaveBeenCalled();
    root.inSidebar = true;
    root.emit('touchstart', 220);
    root.emit('touchmove', 120);
    root.emit('touchend', 100);
    expect(change).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('allows the next deliberate tap immediately after a completed swipe', () => {
    const root = new Surface();
    mount(root);
    root.emit('touchstart');
    root.emit('touchmove', 90);
    root.emit('touchend', 100);
    expect(root.emit('click').preventDefault).toHaveBeenCalled();
    root.emit('touchstart');
    root.emit('touchend');
    expect(root.emit('click').preventDefault).not.toHaveBeenCalled();
  });

  it('leaves vertical scrolling and ordinary taps available', () => {
    const root = new Surface();
    const change = mount(root);
    root.emit('touchstart');
    expect(root.emit('touchmove', 12, 170).preventDefault).not.toHaveBeenCalled();
    root.emit('touchend', 100, 170);
    expect(change).not.toHaveBeenCalled();
    expect(root.emit('click').preventDefault).not.toHaveBeenCalled();
  });

  it.each(['excluded', 'modal', 'selection'] as const)('leaves %s interactions alone', blocker => {
    const root = new Surface();
    if (blocker === 'selection') root.selection = 'Selected text';
    else root[blocker] = true;
    const change = mount(root);
    root.emit('touchstart');
    expect(root.emit('touchmove', 100).preventDefault).not.toHaveBeenCalled();
    root.emit('touchend', 110);
    expect(change).not.toHaveBeenCalled();
  });

  it.each(['multitouch', 'touchcancel', 'noncancelable', 'selection'])('abandons %s gestures', reason => {
    const root = new Surface();
    const change = mount(root);
    root.emit('touchstart');
    if (reason === 'touchcancel') root.emit('touchcancel');
    else {
      if (reason === 'selection') root.selection = 'Selected while dragging';
      root.emit('touchmove', 90, 100, reason === 'multitouch' ? { touches: [{}, {}] }
        : reason === 'noncancelable' ? { cancelable: false } : {});
    }
    root.emit('touchend', 100);
    expect(change).not.toHaveBeenCalled();
  });

  it('does not attach on desktop and removes every listener when unmounted', () => {
    const root = new Surface();
    mount(root, false);
    expect(root.listeners.size).toBe(0);
    mount(root);
    expect(root.listeners.size).toBe(5);
    hooks.cleanup?.();
    expect(root.listeners.size).toBe(0);
  });
});
