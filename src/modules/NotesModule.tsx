import { useEffect, useRef, useState } from 'react';
import { Segmented } from '../components/ui';
import { renderMarkdown } from '../lib/markdown';
import { updateArea } from '../store/store';
import type { Area } from '../store/types';

export function NotesModule({ area }: { area: Area }) {
  const [text, setText] = useState(area.notes ?? '');
  const [mode, setMode] = useState<'edit' | 'view'>(area.notes ? 'view' : 'edit');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(text);
  latest.current = text;

  // Guardado automático
  useEffect(() => {
    clearTimeout(timer.current);
    if (text === (area.notes ?? '')) return;
    timer.current = setTimeout(() => updateArea(area.id, { notes: text || undefined }), 600);
    return () => clearTimeout(timer.current);
  }, [text, area.id, area.notes]);

  // Al salir, guardar lo pendiente
  useEffect(
    () => () => {
      if (latest.current !== (area.notes ?? '')) updateArea(area.id, { notes: latest.current || undefined });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [area.id],
  );

  return (
    <div>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'edit', label: 'Escribir' },
          { value: 'view', label: 'Ver' },
        ]}
      />
      <div className="mt12">
        {mode === 'edit' ? (
          <>
            <textarea
              className="textarea"
              style={{ minHeight: 360 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Lo que quieras: ideas, enlaces, resúmenes…\n\n# Títulos con almohadilla\n- listas con guion\n**negrita**'}
            />
            <p className="hint">Se guarda solo.</p>
          </>
        ) : text.trim() ? (
          <div className="card">
            <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
          </div>
        ) : (
          <div className="card small muted">Sin notas todavía.</div>
        )}
      </div>
    </div>
  );
}
