import { CalendarDays, Plus, RefreshCw, Search } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AgendaRow, EntryRow } from '../components/AgendaRow';
import { openSheet } from '../components/sheets';
import { Empty, SectionHead, toast } from '../components/ui';
import { toMinutes } from '../lib/calendar';
import { addDays, capitalize, formatLong, formatRelative, greeting, toISODate } from '../lib/dates';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { useTick, useToday } from '../lib/useToday';
import { agendaForDate, categoryMap, itemTitle, overdueEntries, undatedTasks, type AgendaItem } from '../store/selectors';
import { getState, updateEntry, useApp } from '../store/store';
import { HabitsToday } from './Habits';
import { GoogleBanner, GoogleStatusButton } from './GoogleStatus';

/** Lo de hoy: qué toca, lo que quedó de otros días, los hábitos y lo de mañana. */
export function Today() {
  const state = useApp();
  const today = useToday();
  const route = useRoute();
  const [showOverdue, setShowOverdue] = useState(false);
  const [showUndated, setShowUndated] = useState(false);

  // Enlaces directos: #/hoy?ver=<id> (desde un aviso), ?nuevo=1, ?accion=buscar|importar (atajos del icono)
  const ver = route.query.get('ver');
  const nuevo = route.query.get('nuevo');
  const accion = route.query.get('accion');
  useEffect(() => {
    if (ver) {
      clearQuery('ver');
      openSheet({ type: 'entry', id: ver });
    } else if (nuevo) {
      clearQuery('nuevo');
      openSheet({ type: 'quick' });
    } else if (accion) {
      clearQuery('accion');
      if (accion === 'buscar') navigate('/buscar');
      else if (accion === 'importar') openSheet({ type: 'import' });
      else if (accion === 'calendario') navigate('/calendario');
    }
  }, [ver, nuevo, accion]);

  const items = useMemo(() => agendaForDate(state, today), [state, today]);
  const tomorrow = useMemo(() => agendaForDate(state, addDays(today, 1)), [state, today]);
  const overdue = overdueEntries(state, today);
  const undated = undatedTasks(state);
  const cats = categoryMap(state);
  const name = state.settings.name;
  const hasHabits = state.habits.some((h) => !h.archived);

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <div className="hello">
            {greeting()}
            {name ? `, ${name}` : ''} {state.settings.emoji || '👋'}
          </div>
          <h1>Hoy</h1>
          <div className="sub">{capitalize(formatLong(today))}</div>
        </div>
        <div className="actions">
          <button className="icon-btn" aria-label="Buscar" onClick={() => navigate('/buscar')}>
            <Search size={19} />
          </button>
          <GoogleStatusButton />
        </div>
      </div>

      <button className="quick-bar" onClick={() => openSheet({ type: 'quick' })}>
        <Plus size={20} color="var(--primary)" />
        <span className="ph">Añade algo… «#trabajo reunión mañana a las 10»</span>
      </button>
      <GoogleBanner />

      {overdue.length > 0 && (
        <div className="section">
          {showOverdue ? (
            <>
              <SectionHead
                title="De otros días"
                count={overdue.length}
                action={
                  <button className="link-btn" onClick={() => moveToToday(overdue.map((e) => e.id), today)}>
                    Todo a hoy
                  </button>
                }
              />
              <div className="list">
                {overdue.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    category={e.categoryId ? cats.get(e.categoryId) : undefined}
                    showDate
                    trail={
                      <button
                        className="chip mini"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          moveToToday([e.id], today);
                        }}
                      >
                        A hoy
                      </button>
                    }
                  />
                ))}
              </div>
              <button className="link-btn mt8" onClick={() => setShowOverdue(false)}>
                Ver menos
              </button>
            </>
          ) : (
            // Sin culpa: una línea, y a un toque pasarlo todo a hoy.
            <div className="card hstack overdue-line">
              <div className="grow small" role="button" tabIndex={0} onClick={() => setShowOverdue(true)} style={{ minWidth: 0, cursor: 'pointer' }}>
                <b>{overdue.length === 1 ? 'Te quedó 1 cosa de otro día' : `Te quedaron ${overdue.length} cosas de otros días`}</b>
                <div className="muted ellipsis">{overdue.map((e) => e.title).join(' · ')}</div>
              </div>
              <button className="btn small secondary" onClick={() => moveToToday(overdue.map((e) => e.id), today)}>
                A hoy
              </button>
            </div>
          )}
        </div>
      )}

      <div className="section">
        <SectionHead
          title="Lo de hoy"
          count={items.length || undefined}
          action={
            <button className="link-btn" onClick={() => navigate('/calendario')}>
              <CalendarDays size={16} style={{ verticalAlign: -3 }} /> Calendario
            </button>
          }
        />
        {items.length ? (
          <TodayList items={items} />
        ) : (
          <div className="card">
            <Empty
              emoji="🌤️"
              title="Nada para hoy"
              text="Un día libre. ¿Apuntas algo?"
              action={
                <button className="btn small" onClick={() => openSheet({ type: 'quick', date: today })}>
                  <Plus size={16} /> Añadir
                </button>
              }
            />
          </div>
        )}
      </div>

      {hasHabits && <HabitsToday today={today} />}

      <div className="section">
        <SectionHead title="Mañana" count={tomorrow.length || undefined} />
        {tomorrow.length ? (
          <div className="list">
            {tomorrow.slice(0, 4).map((i) => (
              <AgendaRow key={i.key} item={i} />
            ))}
            {tomorrow.length > 4 && (
              <button className="row tappable more-row" onClick={() => navigate(`/calendario?dia=${addDays(today, 1)}`)}>
                y {tomorrow.length - 4} más · ver el día
              </button>
            )}
          </div>
        ) : (
          <p className="hint" style={{ margin: '0 4px' }}>
            Nada todavía.
          </p>
        )}
      </div>

      {undated.length > 0 && (
        <div className="section">
          <SectionHead
            title="Sin fecha"
            count={undated.length}
            action={
              undated.length > 3 ? (
                <button className="link-btn" onClick={() => setShowUndated(!showUndated)}>
                  {showUndated ? 'Ver menos' : 'Ver todas'}
                </button>
              ) : undefined
            }
          />
          <div className="list">
            {(showUndated ? undated : undated.slice(0, 3)).map((e) => (
              <EntryRow key={e.id} entry={e} category={e.categoryId ? cats.get(e.categoryId) : undefined} />
            ))}
          </div>
        </div>
      )}

      {!hasHabits && (
        <p className="hint center mt24">
          <button className="link-btn" onClick={() => navigate('/habitos')}>
            ¿Quieres llevar algún hábito? (beber agua, leer…)
          </button>
        </p>
      )}
      <RefreshHint />
    </div>
  );
}

/**
 * Lo de hoy en orden: lo de todo el día arriba, luego por horas con la línea de
 * «ahora»; lo que ya pasó (planes, o tareas hechas) se recoge en una línea.
 */
function TodayList({ items }: { items: AgendaItem[] }) {
  const [showGone, setShowGone] = useState(false);
  useTick(60000);
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();
  const untimed = items.filter((i) => !i.time);
  const timed = items.filter((i) => i.time);
  const ends = (i: AgendaItem) => {
    const start = toMinutes(i.time!);
    const end = i.kind === 'entry' && i.entry.endTime ? toMinutes(i.entry.endTime) : i.kind === 'google' && i.event.endTime ? toMinutes(i.event.endTime) : start + 60;
    return Math.max(end, start);
  };
  const open = (i: AgendaItem) => i.kind === 'entry' && i.entry.kind !== 'event' && !i.done;
  const gone = timed.filter((i) => ends(i) <= now && !open(i));
  const rest = timed.filter((i) => !gone.includes(i));
  const nowAt = rest.findIndex((i) => toMinutes(i.time!) >= now);
  const at = nowAt === -1 ? rest.length : nowAt;
  return (
    <div className="list">
      {untimed.map((i) => (
        <AgendaRow key={i.key} item={i} />
      ))}
      {gone.length > 0 &&
        (showGone ? (
          gone.map((i) => <AgendaRow key={i.key} item={i} />)
        ) : (
          <button className="row tappable gone-row" onClick={() => setShowGone(true)} aria-label={`Ver lo que ya pasó (${gone.length})`}>
            <span className="lead" aria-hidden>
              ✓
            </span>
            <span className="body ellipsis">Ya pasó: {gone.map(itemTitle).join(' · ')}</span>
          </button>
        ))}
      {rest.map((i, k) => (
        <Fragment key={i.key}>
          {k === at && <NowLine now={now} />}
          <AgendaRow item={i} />
        </Fragment>
      ))}
      {at === rest.length && rest.length > 0 && <NowLine now={now} />}
    </div>
  );
}

function NowLine({ now }: { now: number }) {
  return (
    <div className="now-line" role="separator" aria-label="Ahora">
      <span>
        Ahora · {String(Math.floor(now / 60)).padStart(2, '0')}:{String(now % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

/** Pasar a hoy lo que quedó de otros días (sin hora: es «para hoy»), con deshacer. */
function moveToToday(ids: string[], today: string) {
  const before = getState()
    .entries.filter((e) => ids.includes(e.id))
    .map(({ id, date, time, endTime, alert }) => ({ id, date, time, endTime, alert }));
  for (const id of ids) updateEntry(id, { date: today, time: undefined, endTime: undefined, alert: null });
  toast(before.length === 1 ? 'Pasado a hoy' : `${before.length} cosas pasadas a hoy`, {
    action: 'Deshacer',
    onAction: () => before.forEach(({ id, ...prev }) => updateEntry(id, prev)),
  });
}

function RefreshHint() {
  const state = useApp();
  if (!state.settings.google.lastSync) return null;
  return (
    <p className="hint center mt24">
      <RefreshCw size={12} style={{ verticalAlign: -1 }} /> Google Calendar actualizado {formatRelative(toISODate(new Date(state.settings.google.lastSync))).toLowerCase()} a las{' '}
      {new Date(state.settings.google.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}
