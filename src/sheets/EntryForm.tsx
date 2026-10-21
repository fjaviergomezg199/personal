import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES } from '../lib/categories';
import { ALLDAY_ALERTS, formatAlert, TIMED_ALERTS } from '../lib/dates';
import { REPEAT_LABELS } from '../lib/recurrence';
import { sortedAreas } from '../store/selectors';
import { getState } from '../store/store';
import type { Entry, EntryKind, Repeat } from '../store/types';

export type EntryDraft = Pick<
  Entry,
  'kind' | 'title' | 'date' | 'time' | 'endTime' | 'endDate' | 'repeat' | 'repeatUntil' | 'alert' | 'areaId' | 'category' | 'location' | 'url' | 'notes' | 'important'
>;

export const KIND_OPTIONS: { value: EntryKind; label: string; emoji: string; hint: string }[] = [
  { value: 'reminder', label: 'Recordatorio', emoji: '⏰', hint: 'Algo que hacer a una hora o un día' },
  { value: 'event', label: 'Plan', emoji: '📅', hint: 'Algo que pasa: cena, concierto, viaje…' },
  { value: 'task', label: 'Tarea', emoji: '✅', hint: 'Pendiente, con fecha o sin ella' },
];

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
}) {
  const { draft: d, onChange } = props;
  const [more, setMore] = useState(!!props.startOpen);
  const areas = sortedAreas(getState());
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

      <div className="two" style={{ marginTop: props.showTitle ? 14 : 0 }}>
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
            <span className="label">Tipo de plan</span>
            <div className="chips">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`chip mini ${d.category === c.key ? 'on' : ''}`}
                  onClick={() => onChange({ category: d.category === c.key ? undefined : c.key })}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {areas.length > 0 && (
            <div className="field">
              <label htmlFor="ef-area">Área</label>
              <select id="ef-area" className="select" value={d.areaId ?? ''} onChange={(e) => onChange({ areaId: e.target.value || undefined })}>
                <option value="">Ninguna</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji} {a.name}
                  </option>
                ))}
              </select>
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
