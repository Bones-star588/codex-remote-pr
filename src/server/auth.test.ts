import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('password authentication', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-remote-auth-'));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores a hash and verifies only the correct password', async () => {
    const auth = await import('./auth.js');

    await auth.setPassword('correct horse');

    const raw = fs.readFileSync(path.join(tempDir, 'auth.json'), 'utf8');
    expect(raw).not.toContain('correct horse');
    await expect(auth.verifyPassword('correct horse')).resolves.toBe(true);
    await expect(auth.verifyPassword('wrong password')).resolves.toBe(false);
  });

  it('rejects short passwords', async () => {
    const auth = await import('./auth.js');
    await expect(auth.setPassword('123')).rejects.toThrow(/at least 6/i);
  });

  it('verifies signed sessions and rejects tampering', async () => {
    const auth = await import('./auth.js');
    const token = auth.issueSession();

    expect(auth.verifySessionToken(token)?.sid).toBeTruthy();
    expect(auth.verifySessionToken(`${token}x`)).toBeNull();
    expect(auth.verifySessionToken(undefined)).toBeNull();
  });
});
