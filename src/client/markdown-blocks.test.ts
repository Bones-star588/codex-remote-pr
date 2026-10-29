import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { markdownBlocks, remarkAssistantSources } from './markdown-blocks';

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

describe('assistant source markers', () => {
  const marker = '\uE200cite\uE202turn0search0\uE202turn1search1\uE201';
  const render = (text: string, assistant = true) => renderToStaticMarkup(createElement(ReactMarkdown,
    { remarkPlugins: assistant ? [remarkAssistantSources] : [],
      urlTransform: url => /^[a-z]:[\\/]/i.test(url) ? url : defaultUrlTransform(url), children: text }));

  it('renders native file citations as compact links across Windows and macOS paths', () => {
    const input = 'Sources: :codex-file-citation{path="F:/Project/docs/design_notes.docx" purpose="source"} and ' +
      'codex-file-citation{purpose="source" path="F:\\Project\\Core\\Src\\main.c:42"}.\n\n' +
      '::codex-file-citation{path="/Users/operator/My Project/slides.pptx" purpose="output"}';
    expect(render(input)).toBe('<p>Sources: <a href="F:/Project/docs/design_notes.docx">design_notes.docx</a> and ' +
      '<a href="F:/Project/Core/Src/main.c:42">main.c:42</a>.</p>\n' +
      '<p><a href="/Users/operator/My%20Project/slides.pptx">slides.pptx</a></p>');
  });

  it('handles Unicode, Markdown punctuation, file URLs and workspace-relative citations', () => {
    expect(render(':codex-file-citation{path="F:/Project/\u62a5\u544a [final]_v1.docx" purpose="output"}'))
      .toBe('<p><a href="F:/Project/%E6%8A%A5%E5%91%8A%20%5Bfinal%5D_v1.docx">\u62a5\u544a [final]_v1.docx</a></p>');
    expect(render(':codex-file-citation{path="file:///C:/My%20Project/main.c#L12" purpose="source"}'))
      .toBe('<p><a href="C:/My%20Project/main.c:12">main.c:12</a></p>');
    expect(render(":codex-file-citation{path='./src/main.ts' purpose='source'}"))
      .toBe('<p><a href="./src/main.ts">main.ts</a></p>');
  });

  it('preserves literal citations in code, existing links, HTML and user messages', () => {
    const citation = ':codex-file-citation{path="F:/Project/main.c" purpose="source"}';
    expect(render(`\`${citation}\`\n\n\`\`\`txt\n${citation}\n\`\`\``))
      .toContain(`<code>${citation.replaceAll('"', '&quot;')}</code>`);
    expect(render(`[${citation}](https://example.com)`)).toContain('codex-file-citation');
    expect(render(`<!-- ${citation} -->`)).not.toContain('<a ');
    expect(render(citation, false)).not.toContain('<a ');
  });

  it('keeps malformed, incomplete and unsafe file citations as literal text', () => {
    for (const body of ['path="javascript:alert(1)"', 'path="https://example.com/x.ts"',
      'path="F:/Project/a.ts" unexpected', 'path="a.ts" path="b.ts"', 'purpose="source"']) {
      expect(render(`:codex-file-citation{${body}}`)).not.toContain('<a ');
    }
    expect(render(':codex-file-citation{path="F:/Project/part')).not.toContain('<a ');
  });

  it('hides internal sources in assistant prose without changing surrounding text or real links', () => {
    expect(render(`Useful answer. ${marker} [Source](https://example.com)`))
      .toBe('<p>Useful answer.  <a href="https://example.com">Source</a></p>');
    expect(render(`File answer.\uE200filecite\uE202turn0file0\uE202L1-L2\uE201`))
      .toBe('<p>File answer.</p>');
  });

  it('hides unfinished source identifiers during streaming', () => {
    expect(render('Answer.\uE200cite\uE202turn0se')).toBe('<p>Answer.</p>');
  });

  it('preserves literal source markers inside inline and fenced code', () => {
    expect(render(`\`${marker}\`\n\n\`\`\`txt\n${marker}\n\`\`\``))
      .toBe(`<p><code>${marker}</code></p>\n<pre><code class="language-txt">${marker}\n</code></pre>`);
  });

  it('preserves raw text and leaves non-assistant Markdown unchanged', () => {
    const input = `Literal marker: ${marker}`;
    expect(render(input, false)).toBe(`<p>${input}</p>`);
    expect(markdownBlocks(input)[0]!.text).toBe(input);
    expect(render('Normal text: turn0search0, cite and filecite.'))
      .toBe('<p>Normal text: turn0search0, cite and filecite.</p>');
  });

  it('retains a real linked source when its label consists of an internal marker', () => {
    expect(render(`[${marker}](https://example.com/source)`))
      .toBe('<p><a href="https://example.com/source">https://example.com/source</a></p>');
  });
});
