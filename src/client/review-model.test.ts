import { describe, expect, it } from 'vitest';
import { buildReviewTurns, parseFileDiff, splitDiffLines } from './review-model';
import type { ThreadItem } from './types';

const diff = '--- a/demo.ts\n+++ b/demo.ts\n@@ -8,3 +8,4 @@\n before\n-old\n+new\n+extra\n after\n';

describe('native file change review', () => {
  it('keeps line numbers correct for unified and split diffs', () => {
    const file = parseFileDiff({ path: 'demo.ts', diff });
    expect([file.added, file.deleted]).toEqual([2, 1]);
    expect(file.hunks[0]!.lines.map(({ oldLine, newLine }) => [oldLine, newLine])).toEqual([
      [8, 8], [9, null], [null, 9], [null, 10], [10, 11]
    ]);
    const rows = splitDiffLines(file.hunks[0]!.lines);
    expect(rows[1]!.left?.text).toBe('old');
    expect(rows[1]!.right?.text).toBe('new');
    expect(rows[2]!.left).toBeNull();
    expect(rows[2]!.right?.text).toBe('extra');
  });

  it('keeps reviews from separate turns separate', () => {
    const items: ThreadItem[] = ['first', 'second'].map((turnId) => ({
      type: 'fileChange', id: 'patch', turnId, status: 'completed',
      changes: [{ path: 'demo.ts', diff }]
    }));
    const turns = buildReviewTurns(items);
    expect(turns.map((turn) => turn.id)).toEqual(['second', 'first']);
    expect(turns[0]!.files[0]!.added).toBe(2);
  });

  it('preserves changed files when the native item has no diff', () => {
    expect(parseFileDiff({ path: 'image.png' })).toEqual({
      path: 'image.png', added: 0, deleted: 0, hunks: []
    });
  });

  it('renders native added and deleted file bodies without patch headers', () => {
    const added = parseFileDiff({ path: 'new.ts', kind: { type: 'add' }, diff: '+literal\r\n\r\nlast\r\n' });
    expect([added.added, added.deleted]).toEqual([3, 0]);
    expect(added.hunks[0]!.lines[0]).toEqual({ type: 'add', text: '+literal', oldLine: null, newLine: 1 });
    const deleted = parseFileDiff({ path: 'old.ts', kind: 'delete', diff: 'old\nline' });
    expect([deleted.added, deleted.deleted]).toEqual([0, 2]);
    expect(deleted.hunks[0]!.lines[1]).toEqual({ type: 'delete', text: 'line', oldLine: 2, newLine: null });
  });
});
