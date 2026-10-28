export function previewPixelRatio(width: number, height: number, deviceRatio: number): number {
  return Math.min(deviceRatio || 1, Math.sqrt(8_000_000 / (width * height)),
    8192 / Math.max(width, height));
}

export function previewDocument(html: string, url: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const base = document.querySelector('base[href]') ?? document.createElement('base');
  base.setAttribute('href', new URL(base.getAttribute('href') || '.', url).href);
  document.head.prepend(base);
  return `${document.doctype ? new XMLSerializer().serializeToString(document.doctype) : ''}\n${document.documentElement.outerHTML}`;
}
