import type { PreviewTarget } from '../shared/file-preview';

export function previewTarget(href: string, cwd: string): PreviewTarget | null {
  if (/^https?:\/\//i.test(href)) return { kind: 'url', url: href };
  if (/^(?:#|\/api\/)/.test(href)) return null;
  let value = href;
  if (/^file:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = url.pathname.replace(/^\/([a-z]:)/i, '$1') + url.hash;
    }
    catch { return null; }
  } else if (/^[a-z][\w+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return null;
  try { value = decodeURIComponent(value); } catch { return null; }
  const line = /(?::(\d+)(?::\d+)?|#L(\d+)(?:C\d+)?(?:-L?\d+(?:C\d+)?)?)$/i.exec(value);
  if (line) value = value.slice(0, line.index);
  value = value.replace(/\\/g, '/');
  if (!value || value.includes('\0')) return null;
  const absolute = /^(?:[a-z]:\/|\/)/i.test(value);
  if (!absolute && (!cwd || !/(?:^|\/)[^/]+\.[\w.-]+$/.test(value))) return null;
  if (!absolute) value = `${cwd.replace(/\\/g, '/').replace(/\/$/, '')}/${value}`;
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (part === '..') { if (parts.length > 1) parts.pop(); }
    else if (part !== '.') parts.push(part);
  }
  return { kind: 'file', path: parts.join('/'), ...(line ? { line: Number(line[1] ?? line[2]) } : {}) };
}

export function previewLabel(target: PreviewTarget): string {
  if (target.kind === 'file') return target.path.replace(/\\/g, '/').split('/').at(-1) || target.path;
  try { return new URL(target.url).hostname; } catch { return target.url; }
}
