import { describe, expect, it } from 'vitest';
import { isAllowedRpcMethod } from './codex-bridge.js';

describe('Codex bridge method allowlist', () => {
  it('allows task and approval-related client methods', () => {
    expect(isAllowedRpcMethod('thread/list')).toBe(true);
    expect(isAllowedRpcMethod('thread/read')).toBe(true);
    expect(isAllowedRpcMethod('thread/resume')).toBe(true);
    expect(isAllowedRpcMethod('thread/goal/get')).toBe(true);
    expect(isAllowedRpcMethod('thread/goal/set')).toBe(true);
    expect(isAllowedRpcMethod('thread/goal/clear')).toBe(true);
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

describe('command RPC access', () => {
  it('allows the native command methods without permitting arbitrary config or execution methods', () => {
    for (const method of ['skills/list', 'collaborationMode/list', 'thread/compact/start', 'thread/fork', 'review/start',
      'thread/unsubscribe', 'thread/queue/list', 'thread/queue/add', 'thread/queue/update', 'thread/queue/delete',
      'thread/queue/start', 'fs/readDirectory', 'fs/createDirectory', 'project/create']) {
      expect(isAllowedRpcMethod(method), method).toBe(true);
    }
    for (const method of ['config/write', 'command/exec', 'anything/else']) {
      expect(isAllowedRpcMethod(method), method).toBe(false);
    }
  });
});
