import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import type { PreviewTarget } from '../../shared/file-preview';
import { previewTarget } from '../preview-links';
import { previewContentUrl } from '../../shared/file-preview';
import { localImageSource } from '../markdown-media';
import { ImagePreview } from './ImagePreview';

const PreviewContext = createContext<{ cwd: string; open: ((target: PreviewTarget) => void) | undefined }>({ cwd: '', open: undefined });

export function PreviewLinks({ cwd, onOpen, children }: {
  cwd: string; onOpen?: ((target: PreviewTarget) => void) | undefined; children: ReactNode;
}) {
  const parent = useContext(PreviewContext);
  const value = useMemo(() => ({ cwd, open: onOpen ?? parent.open }), [cwd, onOpen, parent.open]);
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function PreviewLink({ href = '', children, ...props }: ComponentProps<'a'>) {
  const { cwd, open } = useContext(PreviewContext);
  const target = previewTarget(href, cwd);
  return <a {...props} href={target?.kind === 'file' ? previewContentUrl(target.path) : href}
    target="_blank" rel="noreferrer" onClick={event => {
    if (!open || !target || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(target);
  }}>{children}</a>;
}

export function PreviewImage({ src, alt = '' }: { src: string | undefined; alt?: string }) {
  const { cwd } = useContext(PreviewContext);
  const target = src ? previewTarget(src, cwd) : null;
  const resolved = target?.kind === 'file' ? previewContentUrl(target.path) : localImageSource(src);
  return <ImagePreview src={resolved} alt={alt} />;
}
