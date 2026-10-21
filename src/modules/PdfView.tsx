import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js se carga solo cuando se abre un PDF (y queda guardado para usarlo sin conexión). */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      const pdfjs = lib as unknown as PdfJs;
      pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export function PdfView({ blob }: { blob: Blob }) {
  const host = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let doc: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        setStatus('loading');
        const pdfjs = await loadPdfJs();
        const data = new Uint8Array(await blob.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        doc = pdf;
        if (cancelled) return;
        setPages(pdf.numPages);
        const el = host.current;
        if (!el) return;
        el.innerHTML = '';
        const width = Math.min(el.clientWidth - 20, 1100);
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        setStatus('ok');
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * zoom;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          el.appendChild(canvas);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [blob, zoom]);

  return (
    <div>
      {status === 'loading' && <p className="center muted" style={{ padding: 30 }}>Abriendo PDF…</p>}
      {status === 'error' && (
        <p className="center muted" style={{ padding: 30 }}>
          No se pudo mostrar el PDF aquí. Usa el botón de compartir para abrirlo con otra app.
        </p>
      )}
      <div ref={host} className="pdf-pages" style={{ overflowX: zoom > 1 ? 'auto' : undefined, alignItems: zoom > 1 ? 'flex-start' : 'center' }} />
      {status === 'ok' && (
        <div
          className="hstack"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--safe-b) + 16px)',
            right: 16,
            background: 'var(--bg-elev)',
            borderRadius: 99,
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            zIndex: 2,
          }}
        >
          <button className="icon-btn small plain" aria-label="Alejar" disabled={zoom <= 0.6} onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.25).toFixed(2)))}>
            <Minus size={16} />
          </button>
          <span className="tiny" style={{ minWidth: 70, textAlign: 'center' }}>
            {Math.round(zoom * 100)}% · {pages} p.
          </span>
          <button className="icon-btn small plain" aria-label="Acercar" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
