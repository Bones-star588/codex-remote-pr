export interface ReadingAnchor {
  key: string;
  node: HTMLElement;
  offset: number;
}

export function captureReadingAnchor(stream: HTMLElement, inner: HTMLElement): ReadingAnchor | null {
  const viewport = stream.getBoundingClientRect();
  const visible = (node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > viewport.top + 1 && rect.top < viewport.bottom;
  };
  let low = 0;
  let high = inner.children.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (inner.children[middle]!.getBoundingClientRect().bottom <= viewport.top + 1) low = middle + 1;
    else high = middle;
  }
  for (let index = low; index < inner.children.length; index++) {
    const child = inner.children[index]!;
    if (child.getBoundingClientRect().top >= viewport.bottom) break;
    if (!(child instanceof HTMLElement) || !visible(child)) continue;
    const node = [...child.querySelectorAll<HTMLElement>('[data-scroll-anchor]')].find(visible)
      ?? (child.dataset.scrollAnchor ? child : null);
    if (node) return { key: node.dataset.scrollAnchor!, node, offset: node.getBoundingClientRect().top - viewport.top };
  }
  return null;
}

export function restoreReadingAnchor(stream: HTMLElement, inner: HTMLElement, anchor: ReadingAnchor): boolean {
  const node = inner.contains(anchor.node) ? anchor.node
    : [...inner.querySelectorAll<HTMLElement>('[data-scroll-anchor]')].find(node => node.dataset.scrollAnchor === anchor.key);
  if (!node) return false;
  anchor.node = node;
  const delta = node.getBoundingClientRect().top - stream.getBoundingClientRect().top - anchor.offset;
  if (Math.abs(delta) <= .5) return false;
  stream.scrollTop += delta;
  return true;
}
