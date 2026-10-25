import { describe, expect, it } from 'vitest';

import { isAllowedRpcMethod } from './codex-bridge.js';

describe('Codex bridge method allowlist', () => {
  it('allows task and approval-related client methods', () => {
    expect(isAllowedRpcMethod('thread/list')).toBe(true);
    expect(isAllowedRpcMethod('thread/read')).toBe(true);
    expect(isAllowedRpcMethod('thread/resume')).toBe(true);
    expect(isAllowedRpcMethod('turn/start')).toBe(true);
    expect(isAllowedRpcMethod('turn/interrupt')).toBe(true);
    expect(isAllowedRpcMethod('model/list')).toBe(true);
    expect(isAllowedRpcMethod('thread/settings/update')).toBe(true);
  });

  it('rejects direct process execution methods', () => {
    expect(isAllowedRpcMethod('process/spawn')).toBe(false);
    expect(isAllowedRpcMethod('command/exec')).toBe(false);
    expect(isAllowedRpcMethod('fs/writeFile')).toBe(false);
  });
});
