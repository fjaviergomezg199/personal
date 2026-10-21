import { ChevronLeft, Share2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../components/ui';
import { saveFile } from '../lib/files';
import { renderMarkdown } from '../lib/markdown';
import { useOverlay } from '../lib/router';
import { files } from '../store/db';
import type { DocMeta } from '../store/types';

const PdfView = lazy(() => import('./PdfView').then((m) => ({ default: m.PdfView })));

export function DocViewer({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  useOverlay(true, onClose);
  const [blob, setBlob] = useState<Blob | null | undefined>(undefined);
  const [htmlText, setHtmlText] = useState<string>('');

  useEffect(() => {
    if (doc.type === 'text' || doc.type === 'link') return;
    let alive = true;
    void files.get(doc.id).then(async (b) => {
      if (!alive) return;
      setBlob(b ?? null);
      if (b && doc.type === 'html') setHtmlText(await b.text());
    });
    return () => {
      alive = false;
    };
  }, [doc.id, doc.type]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const objectUrl = useMemo(() => (blob && doc.type === 'image' ? URL.createObjectURL(blob) : ''), [blob, doc.type]);
  useEffect(() => () => void (objectUrl && URL.revokeObjectURL(objectUrl)), [objectUrl]);

  const share = async () => {
    if (doc.type === 'text') {
      await saveFile(new Blob([doc.text ?? ''], { type: 'text/markdown' }), `${doc.title}.md`);
      return;
    }
    if (!blob) return;
    const r = await saveFile(blob, doc.fileName ?? doc.title);
    if (r === 'downloaded') toast('Descargado');
  };

  return createPortal(
    <div className="doc-viewer" role="dialog" aria-modal="true" aria-label={doc.title}>
      <div className="doc-viewer-head">
        <button className="icon-btn plain" onClick={onClose} aria-label="Volver">
          <ChevronLeft size={24} />
        </button>
        <div className="t">{doc.title}</div>
        <button className="icon-btn plain" onClick={share} aria-label="Compartir o descargar">
          <Share2 size={20} />
        </button>
      </div>
      <div className="doc-viewer-body">
        {blob === null && <p className="center muted" style={{ padding: 30 }}>No se encuentra el archivo en este dispositivo.</p>}
        {doc.type === 'pdf' && blob && (
          <Suspense fallback={<p className="center muted" style={{ padding: 30 }}>Abriendo PDF…</p>}>
            <PdfView blob={blob} />
          </Suspense>
        )}
        {doc.type === 'html' && htmlText && (
          // Sin allow-same-origin: el HTML no puede leer los datos de la app.
          <iframe title={doc.title} sandbox="allow-scripts allow-popups allow-forms allow-modals allow-popups-to-escape-sandbox" srcDoc={htmlText} />
        )}
        {doc.type === 'image' && objectUrl && (
          <div style={{ padding: 10, textAlign: 'center' }}>
            <img src={objectUrl} alt={doc.title} style={{ borderRadius: 12 }} />
          </div>
        )}
        {doc.type === 'text' && (
          <div style={{ padding: '16px 18px 40px', background: 'var(--bg)', minHeight: '100%' }}>
            <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.text ?? '') }} />
          </div>
        )}
        {doc.type === 'file' && blob && (
          <div className="empty">
            <div className="e">📦</div>
            <div className="t">{doc.fileName}</div>
            <p>Este tipo de archivo se abre con otra app del móvil.</p>
            <button className="btn small" onClick={share}>
              <Share2 size={16} /> Abrir con…
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
