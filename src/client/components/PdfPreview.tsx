import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { copyText } from '../clipboard';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ url, name }: { url: string; name: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState('fit');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const textRef = useRef('');
  useEffect(() => {
    const task = getDocument({ url, withCredentials: true, useSystemFonts: true });
    void task.promise.then(setDocument).catch(reason => setError(reason.message));
    return () => { void task.destroy(); };
  }, [url]);
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !width) return;
    let cancelled = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setBusy(true); setError('');
    void (async () => {
      const pdfPage = await document.getPage(page);
      if (cancelled || !canvasRef.current) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      const scale = zoom === 'fit' ? Math.max(.1, (width - 24) / natural.width) : Number(zoom);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      render = pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (cancelled) return;
      setBusy(false);
      const text = await pdfPage.getTextContent();
      if (!cancelled) textRef.current = text.items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
    })().catch(reason => { if (!cancelled) { setError(reason.message); setBusy(false); } });
    return () => { cancelled = true; render?.cancel(); };
  }, [document, page, width, zoom]);
  return <div className="pdf-preview">
    <div className="pdf-toolbar">
      <button type="button" className="icon-button" title="上一页" aria-label="上一页"
        disabled={!document || page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /></button>
      <input aria-label="PDF 页码" type="number" min={1} max={document?.numPages ?? 1} value={page}
        onChange={event => setPage(Math.max(1, Math.min(document?.numPages ?? 1, Number(event.target.value) || 1)))} />
      <span>/ {document?.numPages ?? '…'}</span>
      <button type="button" className="icon-button" title="下一页" aria-label="下一页"
        disabled={!document || page >= document.numPages} onClick={() => setPage(value => value + 1)}><ChevronRight size={16} /></button>
      <select aria-label="PDF 缩放" value={zoom} onChange={event => setZoom(event.target.value)}>
        <option value="fit">适合宽度</option><option value="1">100%</option>
        <option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option>
      </select>
      <button type="button" className="icon-button" title="复制本页文字" aria-label="复制本页文字" disabled={busy}
        onClick={() => { void copyText(textRef.current).catch(reason => setError(reason.message)); }}><Copy size={15} /></button>
    </div>
    {error && <div role="alert" className="file-preview-error">{error}</div>}
    <div className="pdf-viewport" ref={viewportRef} aria-busy={busy}>
      <canvas ref={canvasRef} role="img" aria-label={`${name} · ${page}`} data-rendered={!busy} />
    </div>
  </div>;
}
