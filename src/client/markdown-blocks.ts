import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Nodes, Root } from 'mdast';

const parser = unified().use(remarkParse).use(remarkGfm);

export function remarkAssistantSources() {
  return (tree: Root) => {
    const visit = (node: Nodes): void => {
      if (node.type === 'text') {
        node.value = node.value.replace(/\uE200(?:cite|filecite)\uE202[^\uE200\uE201\r\n]*(?:\uE201|$)/g, '');
      }
      if ('children' in node) node.children.forEach(visit);
      if (node.type === 'link' && node.children.every(child => child.type === 'text' && !child.value.trim())) {
        node.children = [{ type: 'text', value: node.url }];
      }
    };
    visit(tree);
  };
}

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
