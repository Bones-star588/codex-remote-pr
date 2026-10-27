import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryScroll } from './history-scroll';

afterEach(() => vi.useRealTimers());

describe('history insertion during scrolling', () => {
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
