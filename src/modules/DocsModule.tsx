import { Ellipsis, FileUp, Link as LinkIcon, Pin, PinOff, Share2, Trash2, Type } from 'lucide-react';
import { useRef, useState } from 'react';
import { Empty, Sheet, toast } from '../components/ui';
import { formatDayMonth, todayISO, toISODate } from '../lib/dates';
import { formatBytes, saveFile } from '../lib/files';
import { files } from '../store/db';
import { addDoc, deleteDoc, restoreDoc, updateDoc, useApp } from '../store/store';
import type { Area, DocMeta, DocType } from '../store/types';
import { DocViewer } from './DocViewer';

const ICON: Record<DocType, string> = { pdf: '📄', html: '🌐', image: '🖼️', link: '🔗', text: '📝', file: '📦' };
const LABEL: Record<DocType, string> = { pdf: 'PDF', html: 'Artefacto / HTML', image: 'Imagen', link: 'Enlace', text: 'Texto', file: 'Archivo' };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function detectType(file: File): DocType {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type === 'text/html' || /\.html?$/.test(name)) return 'html';
  if (file.type.startsWith('image/')) return 'image';
  return 'file';
}

export function DocsModule({ area }: { area: Area }) {
  const state = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<DocMeta | null>(null);
  const [menu, setMenu] = useState<DocMeta | null>(null);
  const [adding, setAdding] = useState<'link' | 'text' | null>(null);
  const docs = state.docs
    .filter((d) => d.areaId === area.id)
    .sort((a, b) => (a.pinned === b.pinned ? b.createdAt.localeCompare(a.createdAt) : a.pinned ? -1 : 1));

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const file of Array.from(list)) {
      if (file.size > 80 * 1024 * 1024) {
        toast(`${file.name} es demasiado grande (máx. 80 MB)`);
        continue;
      }
      const type = detectType(file);
      // Un .md o .txt se guarda como texto para leerlo bonito.
      if (type === 'file' && /\.(md|markdown|txt)$/i.test(file.name)) {
        await addDoc({ areaId: area.id, title: file.name.replace(/\.[^.]+$/, ''), type: 'text', text: await file.text() });
        continue;
      }
      try {
        await addDoc({ areaId: area.id, title: file.name.replace(/\.[^.]+$/, ''), type, mime: file.type, size: file.size, fileName: file.name }, file);
      } catch {
        toast('No se pudo guardar el archivo (¿falta espacio?)');
        return;
      }
    }
    toast(list.length === 1 ? 'Documento guardado' : `${list.length} documentos guardados`);
    if (input.current) input.current.value = '';
  };

  const open = (d: DocMeta) => {
    if (d.type === 'link' && d.url) window.open(d.url, '_blank', 'noopener,noreferrer');
    else setViewing(d);
  };

  return (
    <div>
      <input ref={input} type="file" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button className="btn secondary small" onClick={() => input.current?.click()}>
          <FileUp size={16} /> Archivo
        </button>
        <button className="btn secondary small" onClick={() => setAdding('link')}>
          <LinkIcon size={16} /> Enlace
        </button>
        <button className="btn secondary small" onClick={() => setAdding('text')}>
          <Type size={16} /> Texto
        </button>
      </div>

      {docs.length ? (
        <div className="list">
          {docs.map((d) => (
            <div key={d.id} className="row tappable" role="button" tabIndex={0} onClick={() => open(d)}>
              <div className="lead" aria-hidden>
                {ICON[d.type]}
              </div>
              <div className="body">
                <div className="title">
                  {d.pinned && '📌 '}
                  {d.title}
                </div>
                <div className="meta">
                  <span>{LABEL[d.type]}</span>
                  {d.size ? <span>{formatBytes(d.size)}</span> : null}
                  {d.type === 'link' && d.url && <span className="ellipsis">{hostOf(d.url)}</span>}
                  <span>{formatDayMonth(toISODate(new Date(d.createdAt)), todayISO())}</span>
                </div>
              </div>
              <button
                className="icon-btn small plain"
                aria-label="Opciones"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(d);
                }}
              >
                <Ellipsis size={18} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty
            emoji="📎"
            title="Sin documentos"
            text="Guarda aquí el PDF o el artefacto que te generó Claude, el temario, el plan de la nutri… Se ven sin salir de la app y sin conexión."
          />
          <p className="hint center">
            Para un artefacto de Claude: descárgalo (menú ⋯ → Descargar) y súbelo como archivo, o guarda su enlace.
          </p>
        </div>
      )}

      {viewing && <DocViewer doc={viewing} onClose={() => setViewing(null)} />}
      {menu && <DocMenu doc={menu} onClose={() => setMenu(null)} />}
      {adding && <AddDocSheet area={area} kind={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}

function DocMenu({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  const [title, setTitle] = useState(doc.title);
  return (
    <Sheet open onClose={onClose} title={doc.title}>
      <div className="field">
        <label htmlFor="dm-title">Nombre</label>
        <input id="dm-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && updateDoc(doc.id, { title: title.trim() })} />
      </div>
      <div className="stack mt16">
        <button
          className="btn secondary block"
          onClick={() => {
            updateDoc(doc.id, { pinned: !doc.pinned });
            onClose();
          }}
        >
          {doc.pinned ? <PinOff size={18} /> : <Pin size={18} />} {doc.pinned ? 'Quitar de arriba' : 'Fijar arriba'}
        </button>
        {doc.type !== 'link' && (
          <button
            className="btn secondary block"
            onClick={async () => {
              if (doc.type === 'text') await saveFile(new Blob([doc.text ?? ''], { type: 'text/markdown' }), `${doc.title}.md`);
              else {
                const b = await files.get(doc.id);
                if (b) await saveFile(b, doc.fileName ?? doc.title);
              }
            }}
          >
            <Share2 size={18} /> Compartir o descargar
          </button>
        )}
        <button
          className="btn danger block"
          onClick={() => {
            const copy = structuredClone(doc);
            deleteDoc(doc.id);
            onClose();
            toast('Documento borrado', { action: 'Deshacer', onAction: () => restoreDoc(copy) });
          }}
        >
          <Trash2 size={18} /> Borrar
        </button>
      </div>
    </Sheet>
  );
}

function AddDocSheet({ area, kind, onClose }: { area: Area; kind: 'link' | 'text'; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const url = value.trim();
  const validUrl = /^https?:\/\/\S+\.\S+/.test(url);
  const autoTitle = () => {
    if (!validUrl) return 'Enlace';
    const u = new URL(url);
    if (u.hostname.endsWith('claude.ai')) return 'Artefacto de Claude';
    if (u.hostname.includes('drive.google')) return 'Documento de Drive';
    return u.hostname.replace(/^www\./, '');
  };
  const canSave = kind === 'link' ? validUrl : value.trim().length > 0;
  const save = async () => {
    if (!canSave) return;
    if (kind === 'link') await addDoc({ areaId: area.id, title: title.trim() || autoTitle(), type: 'link', url });
    else await addDoc({ areaId: area.id, title: title.trim() || value.trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 60) || 'Texto', type: 'text', text: value });
    toast('Guardado');
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={kind === 'link' ? 'Guardar enlace' : 'Pegar texto'}
      full={kind === 'text'}
      footer={
        <button className="btn block" disabled={!canSave} onClick={() => void save()}>
          Guardar
        </button>
      }
    >
      {kind === 'link' ? (
        <>
          <div className="field">
            <label htmlFor="ad-url">Enlace</label>
            <input id="ad-url" className="input" type="url" inputMode="url" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://claude.ai/…" />
          </div>
          <div className="field">
            <label htmlFor="ad-title">Nombre (opcional)</label>
            <input id="ad-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle()} />
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="ad-title2">Nombre (opcional)</label>
            <input id="ad-title2" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Resumen Tema 3" />
          </div>
          <div className="field">
            <label htmlFor="ad-text">Texto (admite formato de Claude: títulos, listas, negritas…)</label>
            <textarea id="ad-text" className="textarea tall" value={value} onChange={(e) => setValue(e.target.value)} style={{ minHeight: 320 }} />
          </div>
        </>
      )}
    </Sheet>
  );
}
