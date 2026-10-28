import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryScroll, historyScrollDelta } from './history-scroll';

afterEach(() => vi.useRealTimers());

describe('history insertion during scrolling', () => {
  it('keeps upward intent through Safari top overscroll and its rebound', () => {
    expect(historyScrollDelta(80, -75, 1000)).toBe(-80);
    expect(historyScrollDelta(-75, -20, 1000)).toBe(0);
    expect(historyScrollDelta(-20, 0, 1000)).toBe(0);
    expect(historyScrollDelta(0, 30, 1000)).toBe(30);
    expect(historyScrollDelta(-20, 0, -10)).toBe(0);
  });

  it('accumulates fine touch motion at a boundary and detects a deliberate reversal', () => {
    const scroll = new HistoryScroll(() => {});
    scroll.startTouch(100);
    expect(scroll.moveTouch(101)).toBeNull();
    expect(scroll.moveTouch(102)).toBeNull();
    expect(scroll.moveTouch(103)).toBe(-1);
    expect(scroll.moveTouch(102)).toBeNull();
    expect(scroll.moveTouch(100)).toBe(1);
    scroll.endTouch();
    expect(scroll.moveTouch(200)).toBeNull();
    scroll.cancel();
  });

  it('retains touch direction until momentum settles, including delayed scroll corrections', async () => {
    vi.useFakeTimers();
    const scroll = new HistoryScroll(() => {});
    scroll.startTouch(100);
    expect(scroll.hasTouchIntent).toBe(false);
    scroll.moveTouch(130);
    scroll.endTouch();
    expect(scroll.hasTouchIntent).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    scroll.activity();
    await vi.advanceTimersByTimeAsync(159);
    expect(scroll.hasTouchIntent).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(scroll.hasTouchIntent).toBe(false);
    scroll.startTouch(100);
    scroll.moveTouch(130);
    scroll.cancel();
    expect(scroll.hasTouchIntent).toBe(false);
  });

  it('waits while a finger remains down, including when it pauses', async () => {
    vi.useFakeTimers();
    const ready = vi.fn();
    const scroll = new HistoryScroll(ready);
    scroll.startTouch();
    const pending = scroll.waitForIdle().then(ready);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ready).not.toHaveBeenCalled();
    scroll.endTouch();
    await vi.advanceTimersByTimeAsync(159);
    expect(ready).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(ready).toHaveBeenCalledWith(true);
  });

  it('also waits for momentum after touchend and wheel bursts', async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const scroll = new HistoryScroll(settled);
    scroll.startTouch();
    scroll.endTouch();
    const ready = vi.fn();
    const pending = scroll.waitForIdle().then(ready);
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(80);
      scroll.activity();
      expect(ready).not.toHaveBeenCalled();
    }
    await vi.advanceTimersByTimeAsync(160);
    await pending;
    expect(ready).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('rechecks activity when a pending network response is ready', async () => {
    vi.useFakeTimers();
    const scroll = new HistoryScroll(() => {});
    scroll.activity();
    await vi.advanceTimersByTimeAsync(160);
    scroll.startTouch();
    const commit = vi.fn();
    const pending = scroll.waitForIdle().then(commit);
    await vi.advanceTimersByTimeAsync(500);
    expect(commit).not.toHaveBeenCalled();
    scroll.endTouch();
    await vi.advanceTimersByTimeAsync(160);
    await pending;
    expect(commit).toHaveBeenCalledWith(true);
  });

  it('releases abandoned history without committing after selection changes', async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const scroll = new HistoryScroll(settled);
    scroll.startTouch();
    const pending = scroll.waitForIdle();
    scroll.cancel();
    await expect(pending).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).not.toHaveBeenCalled();
  });
});
