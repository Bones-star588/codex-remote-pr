import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const hooks = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>, effects: [] as Array<() => unknown>,
  state: 0, open: true, setOpen: vi.fn()
}));
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, memo: (component: unknown) => component,
    useMemo: (compute: () => unknown) => compute(), useId: () => 'synthetic-preview',
    useRef: () => { const ref = { current: null }; hooks.refs.push(ref); return ref; },
    useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
    useState: (initial: unknown) => {
      const index = hooks.state++;
      return index === 3 ? [hooks.open, hooks.setOpen] : [initial, vi.fn()];
    }
  };
});
import { ThreadNavigation } from './ThreadNavigation';

type Element = ReactElement<Record<string, any>>;
function find(element: unknown, predicate: (element: Element) => boolean): Element | undefined {
  if (!element || typeof element !== 'object' || !('props' in element)) return;
  const node = element as Element;
  if (predicate(node)) return node;
  for (const child of [node.props.children].flat()) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
function mount() {
  const navigate = vi.fn();
  const tree = (ThreadNavigation as unknown as (props: any) => Element)({
    turns: [{ id: 'turn', messages: [{ itemId: 'user', prompt: 'Synthetic question', reply: 'Synthetic answer' }] }],
    streamRef: { current: null }, innerRef: { current: null }, busy: false, error: null, onNavigate: navigate
  });
  const dialog = { showModal: vi.fn(), focus: vi.fn(), close: vi.fn(),
    querySelector: vi.fn(() => ({ scrollIntoView: vi.fn() })) };
  const trigger = { focus: vi.fn() };
  hooks.refs[1]!.current = dialog;
  hooks.refs[2]!.current = trigger;
  return { tree, dialog, trigger, navigate, effect: hooks.effects.at(-1)! };
}
beforeEach(() => {
  hooks.refs = []; hooks.effects = []; hooks.state = 0; hooks.open = true; hooks.setOpen.mockReset();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('conversation index dialog focus and dismissal', () => {
  it('focuses the dialog instead of the close button on opening, retaining selected-row scrolling', () => {
    const { tree, dialog, effect } = mount();
    const cleanup = effect() as () => void;
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(find(tree, node => node.type === 'dialog')!.props.tabIndex).toBe(-1);
    const scroll = vi.mocked(requestAnimationFrame).mock.calls[0]![0];
    scroll(0);
    expect(dialog.querySelector).toHaveBeenCalledWith('[aria-current]');
    expect(dialog.querySelector.mock.results[0]!.value.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    cleanup();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });
  it('closes the modal when state closes', () => {
    hooks.open = false;
    const { dialog, effect } = mount();
    effect();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(dialog.focus).not.toHaveBeenCalled();
  });
  it('retains close, Escape, backdrop dismissal and trigger focus restoration', () => {
    const { tree, trigger } = mount();
    const dialog = find(tree, node => node.type === 'dialog')!;
    const close = find(dialog, node => node.props['aria-label'] === '关闭')!;
    close.props.onClick();
    dialog.props.onCancel();
    const backdrop = {};
    dialog.props.onClick({ target: backdrop, currentTarget: backdrop });
    expect(hooks.setOpen).toHaveBeenCalledTimes(3);
    dialog.props.onClick({ target: {}, currentTarget: backdrop });
    expect(hooks.setOpen).toHaveBeenCalledTimes(3);
    dialog.props.onClose();
    expect(hooks.setOpen).toHaveBeenLastCalledWith(false);
    expect(trigger.focus).toHaveBeenCalledOnce();
  });
  it('closes and navigates to the selected native turn and item', () => {
    const { tree, navigate } = mount();
    const dialog = find(tree, node => node.type === 'dialog')!;
    const row = find(dialog, node => node.type === 'button' && !node.props['aria-label'])!;
    row.props.onClick();
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ turnId: 'turn', itemId: 'user' }));
  });
});
