export function localImageSource(source: string | undefined): string {
  if (!source) return '';
  if (/^(?:https?:|data:|blob:)/i.test(source)) return source;

  let localPath = source;
  if (/^file:\/\//i.test(source)) {
    try {
      localPath = decodeURIComponent(new URL(source).pathname).replace(/^\/([A-Za-z]:)/, '$1');
    } catch {
      return source;
    }
  }

  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(localPath);
  const unixHomeAbsolute = /^\/(?:Users|home|tmp|var|private)\//.test(localPath);
  if (!windowsAbsolute && !unixHomeAbsolute) return source;

  return `/api/local-image?path=${encodeURIComponent(localPath.replace(/\\/g, '/'))}`;
}
