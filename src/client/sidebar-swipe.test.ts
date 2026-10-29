import { describe, expect, it } from 'vitest';
import { SidebarSwipe, sidebarSwipeSettings as settings } from './sidebar-swipe';

describe('mobile sidebar swipe direction', () => {
  it('opens with a deliberate right swipe from the left edge', () => {
    const swipe = new SidebarSwipe();
    expect(swipe.begin(12, 180, false, true)).toBe(true);
    expect(swipe.move(18, 182)).toBe(false);
    expect(swipe.move(80, 188)).toBe(true);
    expect(swipe.finish()).toEqual({ consumed: true, open: true });
    expect(swipe.finish()).toEqual({ consumed: false, open: null });
  });

  it('closes an open sidebar with a left swipe away from the edge', () => {
    const swipe = new SidebarSwipe();
    expect(swipe.begin(245, 200, true, true)).toBe(true);
    expect(swipe.move(160, 205)).toBe(true);
    expect(swipe.finish()).toEqual({ consumed: true, open: false });
  });

  it('requires the edge and an eligible starting surface', () => {
    const swipe = new SidebarSwipe();
    expect(swipe.begin(settings.edgeWidth + 1, 100, false, true)).toBe(false);
    expect(swipe.begin(10, 100, false, false)).toBe(false);
    expect(swipe.begin(200, 100, true, false)).toBe(false);
    expect(swipe.move(120, 100)).toBe(false);
    expect(swipe.finish().open).toBeNull();
    expect(swipe.begin(settings.edgeWidth, 100, false, true)).toBe(true);
    swipe.move(settings.edgeWidth + settings.distanceThreshold, 100);
    expect(swipe.finish().open).toBe(true);
  });

  it.each([false, true])('preserves vertical scrolling with sidebar open=%s', open => {
    const swipe = new SidebarSwipe();
    swipe.begin(15, 180, open, true);
    expect(swipe.move(16, 200)).toBe(false);
    expect(swipe.move(open ? -100 : 120, 205)).toBe(false);
    expect(swipe.finish()).toEqual({ consumed: false, open: null });
  });

  it('ignores diagonal intent and wrong-direction drags', () => {
    const swipe = new SidebarSwipe();
    swipe.begin(12, 100, false, true);
    expect(swipe.move(32, 120)).toBe(false);
    expect(swipe.move(140, 120)).toBe(false);
    swipe.begin(20, 100, false, true);
    expect(swipe.move(5, 100)).toBe(false);
    swipe.begin(100, 100, true, true);
    expect(swipe.move(150, 100)).toBe(false);
  });

  it('consumes a horizontal short swipe without toggling or clicking', () => {
    const swipe = new SidebarSwipe();
    swipe.begin(10, 100, false, true);
    expect(swipe.move(35, 100)).toBe(true);
    expect(swipe.finish()).toEqual({ consumed: true, open: null });
  });

  it('does not toggle after returning to the starting point', () => {
    const swipe = new SidebarSwipe();
    swipe.begin(12, 100, false, true);
    swipe.move(100, 100);
    swipe.move(16, 100);
    expect(swipe.finish().open).toBeNull();
  });

  it('abandons cancelled and invalid input', () => {
    const swipe = new SidebarSwipe();
    for (const [x, y] of [[NaN, 1], [1, Infinity], [-1, 1], [1, -1]]) {
      expect(swipe.begin(x!, y!, false, true)).toBe(false);
    }
    swipe.begin(12, 100, false, true);
    swipe.move(100, 100);
    swipe.cancel();
    expect(swipe.finish()).toEqual({ consumed: false, open: null });
    swipe.begin(12, 100, false, true);
    expect(swipe.move(NaN, 100)).toBe(false);
    expect(swipe.finish().open).toBeNull();
  });
});
