import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codexBinaryCandidates } from './config.js';

describe('Codex binary discovery across platforms', () => {
  it('prefers the macOS Codex app over the older ChatGPT bundle', () => {
    const candidates = codexBinaryCandidates('darwin');
    expect(candidates[0]).toBe('/Applications/Codex.app/Contents/Resources/codex');
    expect(candidates).toContain('/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex');
  });

  it('finds user-local macOS apps and leaves PATH as the final fallback', () => {
    const candidates = codexBinaryCandidates('darwin');
    expect(candidates).toContain(path.join(os.homedir(), 'Applications/Codex.app/Contents/Resources/codex'));
    expect(candidates).toContain(path.join(os.homedir(), '.codex/packages/standalone/current/codex'));
    expect(candidates.at(-1)).toBe('codex');
  });

  it('keeps Windows discovery on executable paths', () => {
    const candidates = codexBinaryCandidates('win32');
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.every((candidate) => candidate.endsWith('codex.exe'))).toBe(true);
    expect(candidates.at(-1)).toBe('codex.exe');
  });
});
