import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const parser = unified().use(remarkParse).use(remarkGfm);

export function markdownBlocks(text: string): Array<{ offset: number; text: string }> {
  const tree = parser.parse(text);
  // Footnote numbering and backreferences span the whole document.
  if (tree.children.some(node => node.type === 'footnoteDefinition')) return [{ offset: 0, text }];
  const definitions = tree.children.filter(node => node.type === 'definition' || node.type === 'footnoteDefinition')
    .map(node => text.slice(node.position!.start.offset, node.position!.end.offset)).join('\n\n');
  return tree.children.filter(node => node.type !== 'definition' && node.type !== 'footnoteDefinition').map(node => ({
    offset: node.position!.start.offset!,
    text: text.slice(node.position!.start.offset, node.position!.end.offset) +
      (definitions ? `\n\n${definitions}` : '')
  }));
}
