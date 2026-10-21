import { useState } from 'react';
import { ImportPlanSheet } from '../modules/ImportPlanSheet';
import { addDoc, useApp } from '../store/store';
import { sortedAreas } from '../store/selectors';
import type { Area } from '../store/types';
import { openSheet } from './sheets';
import { Sheet, toast } from './ui';

/** Lo que llega con «Compartir → Día a Día» (Android). */
export function ShareSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const state = useApp();
  const [planArea, setPlanArea] = useState<Area | null>(null);
  const areas = sortedAreas(state);
  const planAreas = areas.filter((a) => a.modules.includes('plan'));
  const docAreas = areas.filter((a) => a.modules.includes('docs'));
  const isUrl = /^https?:\/\/\S+$/.test(text.trim());

  if (planArea) return <ImportPlanSheet area={planArea} mode="paste" initialText={text} onClose={onClose} />;

  return (
    <Sheet open onClose={onClose} title="¿Dónde lo guardo?">
      <div className="code-box" style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', marginBottom: 14 }}>
        {text}
      </div>
      <div className="stack">
        <button
          className="btn secondary block"
          onClick={() => {
            onClose();
            setTimeout(() => openSheet({ type: 'quick', text: text.split('\n')[0].slice(0, 200) }), 50);
          }}
        >
          ⏰ Recordatorio, plan o tarea
        </button>
        {planAreas.map((a) => (
          <button key={a.id} className="btn secondary block" onClick={() => setPlanArea(a)}>
            {a.emoji} Sesión en {a.name}
          </button>
        ))}
        {docAreas.map((a) => (
          <button
            key={`d-${a.id}`}
            className="btn secondary block"
            onClick={async () => {
              if (isUrl) await addDoc({ areaId: a.id, title: new URL(text.trim()).hostname, type: 'link', url: text.trim() });
              else await addDoc({ areaId: a.id, title: text.split('\n')[0].slice(0, 60) || 'Texto', type: 'text', text });
              toast(`Guardado en ${a.name}`);
              onClose();
            }}
          >
            📎 Documento en {a.name}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
