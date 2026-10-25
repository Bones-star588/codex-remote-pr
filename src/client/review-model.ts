// Diff grouping follows codex-webui's codex-surfaces.js (MIT, see THIRD_PARTY_NOTICES.md).
import type { FileChange, ThreadItem } from './types';

export interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'meta';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface ReviewFile {
  path: string;
  added: number;
  deleted: number;
  hunks: DiffHunk[];
}

export interface ReviewTurn {
  id: string;
  files: ReviewFile[];
}

export function parseFileDiff(change: FileChange): ReviewFile {
  const file: ReviewFile = { path: change.path, added: 0, deleted: 0, hunks: [] };
  const kind = typeof change.kind === 'string' ? change.kind : change.kind?.type;
  const diff = change.diff ?? '';
  if ((kind === 'add' || kind === 'delete') && diff && !/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(diff)) {
    const lines = diff.replace(/\r\n/g, '\n').split('\n');
    if (lines.at(-1) === '') lines.pop();
    file[kind === 'add' ? 'added' : 'deleted'] = lines.length;
    file.hunks.push({
      header: kind === 'add' ? '新增文件' : '删除文件',
      lines: lines.map((text, index) => ({
        type: kind,
        text,
        oldLine: kind === 'delete' ? index + 1 : null,
        newLine: kind === 'add' ? index + 1 : null
      }))
    });
    return file;
  }
  let hunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of diff.replace(/\r\n/g, '\n').split('\n')) {
    const header = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk = { header: raw, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    const prefix = raw[0];
    if (prefix !== ' ' && prefix !== '+' && prefix !== '-' && prefix !== '\\') continue;
    const type = prefix === '+' ? 'add' : prefix === '-' ? 'delete' : prefix === '\\' ? 'meta' : 'context';
    if (type === 'add') file.added++;
    if (type === 'delete') file.deleted++;
    hunk.lines.push({
      type,
      text: type === 'meta' ? raw : raw.slice(1),
      oldLine: type === 'add' || type === 'meta' ? null : oldLine++,
      newLine: type === 'delete' || type === 'meta' ? null : newLine++
    });
  }
  return file;
}

export function buildReviewTurns(items: ThreadItem[]): ReviewTurn[] {
  const turns = new Map<string, Map<string, ReviewFile>>();
  for (const item of items) {
    if (item.type !== 'fileChange') continue;
    const id = item.turnId || item.id;
    const files = turns.get(id) ?? new Map<string, ReviewFile>();
    for (const change of item.changes) {
      const parsed = parseFileDiff(change);
      const current = files.get(change.path);
      if (current) {
        current.added += parsed.added;
        current.deleted += parsed.deleted;
        current.hunks.push(...parsed.hunks);
      } else files.set(change.path, parsed);
    }
    turns.set(id, files);
  }
  return [...turns].map(([id, files]) => ({ id, files: [...files.values()] })).reverse();
}

export function splitDiffLines(lines: DiffLine[]): Array<{ left: DiffLine | null; right: DiffLine | null }> {
  const rows: Array<{ left: DiffLine | null; right: DiffLine | null }> = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (line.type !== 'delete' && line.type !== 'add') {
      rows.push({ left: line, right: line });
      index++;
      continue;
    }
    const deletes: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (lines[index]?.type === 'delete') deletes.push(lines[index++]!);
    while (lines[index]?.type === 'add') adds.push(lines[index++]!);
    for (let row = 0; row < Math.max(deletes.length, adds.length); row++) {
      rows.push({ left: deletes[row] ?? null, right: adds[row] ?? null });
    }
  }
  return rows;
}
