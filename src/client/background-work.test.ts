import { afterEach, expect, it, vi } from 'vitest';
import { beginForegroundRead, yieldToInteraction } from './background-work';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('pauses further task pages until the selected chat read completes', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', { visibilityState: 'visible' });
  vi.stubGlobal('navigator', {});
  const release = beginForegroundRead();
  let done = false;
  const pending = yieldToInteraction().then(() => { done = true; });
  await vi.advanceTimersByTimeAsync(200);
  expect(done).toBe(false);
  release();
  await vi.advanceTimersByTimeAsync(20);
  await pending;
  expect(done).toBe(true);
});

it('cancels a deferred background page when leaving the workspace', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', { visibilityState: 'visible' });
  vi.stubGlobal('navigator', {});
  const release = beginForegroundRead();
  const controller = new AbortController();
  const pending = yieldToInteraction(controller.signal);
  const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  release();
  await assertion;
});
