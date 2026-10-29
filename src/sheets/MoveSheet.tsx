import { Sheet, toast } from '../components/ui';
import { addDays, capitalize, parseISODate, toHHMM, weekdayIndex, WEEKDAYS } from '../lib/dates';
import { movedTo, reschedulePatch } from '../lib/reschedule';
import { useToday } from '../lib/useToday';
import { agendaForDate } from '../store/selectors';
import { updateEntry, useApp } from '../store/store';
import type { ID, ISODate } from '../store/types';

/** Pasar algo pendiente a otro día de un toque: los próximos 7 días (con lo que ya tiene cada uno), otro día o sin día. */
export function MoveSheet({ id, onClose }: { id: ID; onClose: () => void }) {
  const state = useApp();
  const today = useToday();
  const e = state.entries.find((x) => x.id === id);
  if (!e) return null;

  const move = (to: ISODate | undefined) => {
    const { date, endDate, time, endTime, alert } = e;
    updateEntry(e.id, reschedulePatch(e, to, today, toHHMM(new Date())));
    toast(to ? `Movido ${movedTo(to, today)}` : 'Sin día: en 📌 Pendientes', {
      action: 'Deshacer',
      onAction: () => updateEntry(e.id, { date, endDate, time, endTime, alert }),
    });
    onClose();
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const dayName = (d: ISODate) => `${WEEKDAYS[weekdayIndex(d)]} ${parseISODate(d).getDate()}`;
  return (
    <Sheet open onClose={onClose} title="¿Para qué día?">
      <p className="small muted" style={{ margin: '0 2px 10px' }}>
        <b style={{ color: 'var(--text)' }}>{e.title}</b>
      </p>
      <div className="list">
        {days.map((d, i) => {
          const n = agendaForDate(state, d).length;
          return (
            <button key={d} className="row tappable no-lead" onClick={() => move(d)}>
              <div className="body">
                <div className="title">{i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : capitalize(dayName(d))}</div>
                {i < 2 && <div className="meta">{dayName(d)}</div>}
              </div>
              <div className="trail tiny">{n ? `${n} ${n === 1 ? 'cosa' : 'cosas'}` : 'Libre'}</div>
            </button>
          );
        })}
        <label className="row no-lead">
          <div className="body">
            <div className="title">Otro día</div>
          </div>
          <input className="input move-date" type="date" min={today} aria-label="Otro día" onChange={(ev) => ev.target.value && move(ev.target.value)} />
        </label>
        {e.date && (
          <button className="row tappable no-lead" onClick={() => move(undefined)}>
            <div className="body">
              <div className="title">Sin día</div>
              <div className="meta">Se queda en 📌 Pendientes</div>
            </div>
          </button>
        )}
      </div>
    </Sheet>
  );
}
