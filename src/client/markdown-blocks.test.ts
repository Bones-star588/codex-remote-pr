import { describe, expect, it } from 'vitest';
import { markdownBlocks } from './markdown-blocks';

describe('streamed Markdown blocks', () => {
  it('keeps completed paragraphs stable while the trailing block grows', () => {
    const before = markdownBlocks('First paragraph.\n\nStill stream');
    const after = markdownBlocks('First paragraph.\n\nStill streaming.');
    expect(before[0]).toEqual(after[0]);
    expect(after[1]!.text).toBe('Still streaming.');
  });

  it('preserves fenced code, nested lists, tables and shared link definitions', () => {
    const input = '```js\none\n\ntwo\n```\n\n- parent\n  - child\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nSee [link][id].\n\n[id]: https://example.com';
    const blocks = markdownBlocks(input);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]!.text).toContain('one\n\ntwo\n```');
    expect(blocks[1]!.text).toContain('  - child');
    expect(blocks[2]!.text).toContain('| 1 | 2 |');
    expect(blocks.every(block => block.text.includes('[id]: https://example.com'))).toBe(true);
  });

  it('keeps document-wide footnote numbering intact', () => {
    const text = 'First[^a].\n\nSecond[^b].\n\n[^a]: One\n\n[^b]: Two';
    expect(markdownBlocks(text)).toEqual([{ offset: 0, text }]);
  });
});
