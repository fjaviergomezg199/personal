import { Check as CheckIcon, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AreaBadge } from '../components/AgendaRow';
import { Sheet, toast } from '../components/ui';
import { SessionText } from '../components/WodText';
import { capitalize, formatLong } from '../lib/dates';
import { navigate } from '../lib/router';
import { deletePlanItem, restorePlanItems, updatePlanItem, useApp } from '../store/store';
import type { ID } from '../store/types';

export function PlanItemSheet(props: { id: ID; onClose: () => void }) {
  const state = useApp();
  const item = state.plan.find((p) => p.id === props.id);
  const area = item ? state.areas.find((a) => a.id === item.areaId) : undefined;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({ title: item?.title ?? '', date: item?.date ?? '', time: item?.time ?? '', details: item?.details ?? '' }));
  const [result, setResult] = useState(item?.result ?? '');

  if (!item || !area) {
    return (
      <Sheet open onClose={props.onClose} title="No encontrado">
        <p className="muted">Esta sesión ya no existe.</p>
      </Sheet>
    );
  }

  const saveEdit = () => {
    if (!draft.title.trim() || !draft.date) return;
    updatePlanItem(item.id, { title: draft.title.trim(), date: draft.date, time: draft.time || undefined, details: draft.details.trim() || undefined });
    setEditing(false);
    toast('Sesión actualizada');
  };

  const saveResult = () => {
    if ((item.result ?? '') !== result.trim()) updatePlanItem(item.id, { result: result.trim() || undefined });
  };

  return (
    <Sheet
      open
      onClose={() => {
        saveResult();
        props.onClose();
      }}
      title={`${area.emoji} ${area.name}`}
      headerExtra={
        <>
          <button className="icon-btn small" aria-label="Editar" onClick={() => setEditing(!editing)}>
            <Pencil size={16} />
          </button>
          <button
            className="icon-btn small"
            aria-label="Borrar"
            onClick={() => {
              const copy = structuredClone(item);
              deletePlanItem(item.id);
              props.onClose();
              toast('Sesión borrada', { action: 'Deshacer', onAction: () => restorePlanItems([copy]) });
            }}
          >
            <Trash2 size={16} />
          </button>
        </>
      }
      footer={
        editing ? (
          <button className="btn block" onClick={saveEdit} disabled={!draft.title.trim() || !draft.date}>
            Guardar cambios
          </button>
        ) : (
          <button
            className={`btn block ${item.done ? 'secondary' : 'tone'} tone-${area.color}`}
            onClick={() => {
              saveResult();
              updatePlanItem(item.id, { done: !item.done });
              if (!item.done) {
                toast('¡Sesión completada! 💪');
                props.onClose();
              }
            }}
          >
            <CheckIcon size={18} /> {item.done ? 'Marcar como pendiente' : 'Hecho'}
          </button>
        )
      }
    >
      {editing ? (
        <div>
          <div className="field">
            <label htmlFor="pi-title">Título</label>
            <input id="pi-title" className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="two mt12">
            <div className="field">
              <label htmlFor="pi-date">Fecha</label>
              <input id="pi-date" className="input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pi-time">Hora (opcional)</label>
              <input id="pi-time" className="input" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
            </div>
          </div>
          <div className="field mt12">
            <label htmlFor="pi-details">Detalle</label>
            <textarea id="pi-details" className="textarea tall" value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
          </div>
        </div>
      ) : (
        <div className={`tone-${area.color}`}>
          <div className="small muted" style={{ fontWeight: 600 }}>
            {capitalize(formatLong(item.date))}
            {item.time ? ` · ${item.time}` : ''}
          </div>
          <h2 style={{ margin: '4px 0 12px', fontSize: 22, lineHeight: 1.25 }}>{item.title}</h2>
          {item.details && (
            <div className="card" style={{ marginBottom: 14 }}>
              <SessionText text={item.details} area={area} />
            </div>
          )}
          {area.modules.includes('lifts') && !area.lifts?.length && item.details && /%/.test(item.details) && (
            <div className="callout" style={{ marginBottom: 14 }}>
              💡 Apunta tus RM en <button className="link-btn" onClick={() => navigate(`/areas/${area.id}?bloque=lifts`)}>Mis RM</button> y aquí verás los kilos de cada porcentaje.
            </div>
          )}
          <div className="field">
            <label htmlFor="pi-result">¿Cómo ha ido? (opcional)</label>
            <input
              id="pi-result"
              className="input"
              value={result}
              placeholder={area.template === 'running' ? 'Ej. 6,2 km en 37:10, buenas sensaciones' : area.template === 'gym' ? 'Ej. 112,5 kg x3 · WOD 12:34' : 'Notas de la sesión'}
              onChange={(e) => setResult(e.target.value)}
              onBlur={saveResult}
            />
          </div>
          <div className="mt16">
            <AreaBadge area={area} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
