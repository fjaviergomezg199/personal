import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState } from 'react';
import { CategoryPicker } from '../components/CategoryPicker';
import { ALLDAY_ALERTS, formatAlert, TIMED_ALERTS } from '../lib/dates';
import { REPEAT_LABELS } from '../lib/recurrence';
import { getState } from '../store/store';
import type { ColorKey, Entry, EntryKind, Repeat } from '../store/types';

export type EntryDraft = Pick<
  Entry,
  | 'kind'
  | 'title'
  | 'date'
  | 'time'
  | 'endTime'
  | 'endDate'
  | 'repeat'
  | 'repeatUntil'
  | 'alert'
  | 'categoryId'
  | 'location'
  | 'url'
  | 'notes'
  | 'important'
>;

export const KIND_OPTIONS: { value: EntryKind; label: string; emoji: string; hint: string }[] = [
  { value: 'event', label: 'Plan', emoji: '📅', hint: 'Algo que pasa: cita, clase, cena, viaje…' },
  { value: 'task', label: 'Tarea', emoji: '✅', hint: 'Algo que hacer y marcar como hecho, con fecha o sin ella' },
  { value: 'reminder', label: 'Recordatorio', emoji: '⏰', hint: 'Que te avise a una hora o un día' },
];

/** Solo lo que se ha cambiado desde que se abrió. */
export function changedFields(initial: EntryDraft, draft: EntryDraft): Partial<EntryDraft> {
  const out: Partial<EntryDraft> = {};
  for (const k of Object.keys({ ...initial, ...draft }) as (keyof EntryDraft)[]) {
    const a = initial[k] ?? undefined;
    const b = draft[k] ?? undefined;
    if (a !== b) (out as Record<string, unknown>)[k] = draft[k];
  }
  return out;
}

/** Ajusta el aviso cuando se pone o se quita la hora. */
export function fixAlert(d: EntryDraft, prevTime: string | undefined, defaultAlert: number | null): number | null {
  const hadTime = !!prevTime;
  const hasTime = !!d.time;
  if (hasTime && !hadTime) return d.alert !== null && ALLDAY_ALERTS.includes(d.alert) ? defaultAlert : (d.alert ?? (d.kind === 'task' ? null : defaultAlert));
  if (!hasTime && hadTime) return d.alert !== null && ALLDAY_ALERTS.includes(d.alert) ? d.alert : null;
  return d.alert;
}

export function EntryFields(props: {
  draft: EntryDraft;
  onChange: (patch: Partial<EntryDraft>) => void;
  showTitle?: boolean;
  showKind?: boolean;
  startOpen?: boolean;
  /** Categoría nueva escrita con «#» que se creará al guardar. */
  pendingCategory?: { name: string; color: ColorKey } | null;
  onDropPendingCategory?: () => void;
}) {
  const { draft: d, onChange } = props;
  const [more, setMore] = useState(!!props.startOpen);
  const defaultAlert = getState().settings.defaultAlert;
  const alertOptions = d.time ? TIMED_ALERTS : ALLDAY_ALERTS;
  const alertValue = d.alert !== null && !alertOptions.includes(d.alert) ? [...alertOptions, d.alert] : alertOptions;

  const setTime = (time: string | undefined) => {
    const next = { ...d, time };
    onChange({ time, alert: fixAlert(next, d.time, defaultAlert), endTime: time ? d.endTime : undefined });
  };

  return (
    <div>
      {props.showKind !== false && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {KIND_OPTIONS.map((k) => (
            <button key={k.value} type="button" className={`chip ${d.kind === k.value ? 'on' : ''}`} onClick={() => onChange({ kind: k.value })}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
      )}

      {props.showTitle && (
        <div className="field">
          <label htmlFor="ef-title">Título</label>
          <input id="ef-title" className="input" value={d.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="¿Qué es?" />
        </div>
      )}

      <div style={{ marginTop: props.showTitle ? 14 : 0 }}>
        <CategoryPicker
          value={d.categoryId}
          onChange={(categoryId) => onChange({ categoryId })}
          pending={props.pendingCategory}
          onDropPending={props.onDropPendingCategory}
        />
      </div>

      <div className="two mt12">
        <div className="field">
          <label htmlFor="ef-date">{d.kind === 'task' ? 'Fecha (opcional)' : 'Fecha'}</label>
          <div className="hstack">
            <input
              id="ef-date"
              className="input"
              type="date"
              value={d.date ?? ''}
              onChange={(e) => onChange({ date: e.target.value || undefined })}
            />
            {d.date && d.kind === 'task' && (
              <button type="button" className="icon-btn small plain" aria-label="Quitar fecha" onClick={() => onChange({ date: undefined, time: undefined, repeat: 'none' })}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="field">
          <label htmlFor="ef-time">Hora (opcional)</label>
          <div className="hstack">
            <input
              id="ef-time"
              className="input"
              type="time"
              value={d.time ?? ''}
              disabled={!d.date}
              onChange={(e) => setTime(e.target.value || undefined)}
            />
            {d.time && (
              <button type="button" className="icon-btn small plain" aria-label="Quitar hora" onClick={() => setTime(undefined)}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {d.date && (
        <div className="two mt12">
          <div className="field">
            <label htmlFor="ef-alert">Aviso</label>
            <select
              id="ef-alert"
              className="select"
              value={d.alert === null ? 'none' : String(d.alert)}
              onChange={(e) => onChange({ alert: e.target.value === 'none' ? null : Number(e.target.value) })}
            >
              <option value="none">Sin aviso</option>
              {alertValue.map((m) => (
                <option key={m} value={m}>
                  {formatAlert(m, !d.time)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ef-repeat">Repetir</label>
            <select id="ef-repeat" className="select" value={d.repeat} onChange={(e) => onChange({ repeat: e.target.value as Repeat })}>
              {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {d.date && !d.time && d.kind !== 'task' && d.alert === null && (
        <p className="hint">Para que te avise el mismo día, ponle una hora.</p>
      )}

      <button type="button" className="link-btn mt12" onClick={() => setMore(!more)} aria-expanded={more}>
        {more ? <ChevronUp size={16} style={{ verticalAlign: -3 }} /> : <ChevronDown size={16} style={{ verticalAlign: -3 }} />} Más opciones
      </button>

      {more && (
        <div className="mt12">
          {d.kind === 'event' && d.date && (
            <div className="two" style={{ marginBottom: 14 }}>
              {d.time ? (
                <div className="field">
                  <label htmlFor="ef-end">Hasta las</label>
                  <input id="ef-end" className="input" type="time" value={d.endTime ?? ''} onChange={(e) => onChange({ endTime: e.target.value || undefined })} />
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="ef-enddate">Hasta el día</label>
                  <input
                    id="ef-enddate"
                    className="input"
                    type="date"
                    min={d.date}
                    value={d.endDate ?? ''}
                    onChange={(e) => onChange({ endDate: e.target.value || undefined })}
                  />
                </div>
              )}
              {d.repeat !== 'none' ? (
                <div className="field">
                  <label htmlFor="ef-until">Repetir hasta</label>
                  <input id="ef-until" className="input" type="date" value={d.repeatUntil ?? ''} onChange={(e) => onChange({ repeatUntil: e.target.value || undefined })} />
                </div>
              ) : (
                <div />
              )}
            </div>
          )}
          {d.kind !== 'event' && d.repeat !== 'none' && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="ef-until2">Repetir hasta (opcional)</label>
              <input id="ef-until2" className="input" type="date" value={d.repeatUntil ?? ''} onChange={(e) => onChange({ repeatUntil: e.target.value || undefined })} />
            </div>
          )}

          <div className="field">
            <label htmlFor="ef-loc">Lugar</label>
            <input id="ef-loc" className="input" value={d.location ?? ''} onChange={(e) => onChange({ location: e.target.value || undefined })} placeholder="Ej. WiZink Center" />
          </div>
          <div className="field">
            <label htmlFor="ef-url">Enlace</label>
            <input
              id="ef-url"
              className="input"
              type="url"
              inputMode="url"
              value={d.url ?? ''}
              onChange={(e) => onChange({ url: e.target.value || undefined })}
              placeholder="Web de las entradas, reserva…"
            />
          </div>
          <div className="field">
            <label htmlFor="ef-notes">Notas</label>
            <textarea id="ef-notes" className="textarea" value={d.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} />
          </div>
          {d.kind === 'task' && (
            <label className="switch-row">
              <div className="grow">
                <div className="t">⭐ Importante</div>
              </div>
              <span className="switch">
                <input type="checkbox" checked={!!d.important} onChange={(e) => onChange({ important: e.target.checked })} />
                <span />
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
