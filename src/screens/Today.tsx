import { CalendarDays, Mic, Plus, RefreshCw, Search } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AgendaRow, EntryRow } from '../components/AgendaRow';
import { openSheet } from '../components/sheets';
import { Empty, SectionHead, toast } from '../components/ui';
import { toMinutes } from '../lib/calendar';
import { addDays, capitalize, formatLong, formatRelative, greeting, toISODate } from '../lib/dates';
import { canDictate, startDictation, useDictation } from '../lib/dictation';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { useTick, useToday } from '../lib/useToday';
import { agendaForDate, categoryMap, itemTitle, pendingEntries, type AgendaItem } from '../store/selectors';
import { toggleEntryDone, useApp } from '../store/store';
import type { ISODate } from '../store/types';
import { HabitsToday } from './Habits';
import { GoogleBanner, GoogleStatusButton } from './GoogleStatus';

/** Lo de hoy: qué toca, lo que quedó de otros días, los hábitos y lo de mañana. */
export function Today() {
  const state = useApp();
  const today = useToday();
  const route = useRoute();
  useDictation(); // para quitar el micrófono si el móvil no deja dictar

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

      <div className="quick-bar">
        <button className="quick-main" onClick={() => openSheet({ type: 'quick' })}>
          <Plus size={20} color="var(--primary)" />
          <span className="ph">Añade algo…</span>
        </button>
        {canDictate() && (
          <button
            className="mic-btn"
            aria-label="Dictar"
            // Se empieza a escuchar ya, en el toque (el navegador lo exige), y se abre «Añadir»
            onClick={() => openSheet({ type: 'quick', dictation: startDictation() })}
          >
            <Mic size={20} />
          </button>
        )}
      </div>
      <GoogleBanner />

      <Pending today={today} />

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

const PENDING_SHOWN = 3; // que «Lo de hoy» siga a la vista en un móvil pequeño

/**
 * 📌 Pendientes: lo que se quedó sin hacer de otros días y lo apuntado sin fecha, para tenerlo a la vista
 * hasta que se haga, y «Mover» para pasarlo a otro día de un toque. Con la primera línea de las notas, por si
 * es algo para leer.
 */
function Pending({ today }: { today: ISODate }) {
  const state = useApp();
  const [all, setAll] = useState(false);
  const list = pendingEntries(state, today);
  const cats = categoryMap(state);
  return (
    <div className="section">
      <SectionHead
        title="📌 Pendientes"
        count={list.length || undefined}
        action={
          <button className="link-btn" onClick={() => openSheet({ type: 'quick', kind: 'task' })}>
            <Plus size={16} style={{ verticalAlign: -3 }} /> Añadir
          </button>
        }
      />
      {list.length ? (
        <div className="list">
          {(all ? list : list.slice(0, PENDING_SHOWN)).map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              category={e.categoryId ? cats.get(e.categoryId) : undefined}
              showDate={!!e.date}
              showNotes
              onToggle={() => {
                // Se va de la lista al marcarla: por si ha sido sin querer
                toggleEntryDone(e.id);
                toast(`Hecho: ${e.title}`, { action: 'Deshacer', onAction: () => toggleEntryDone(e.id) });
              }}
              trail={
                <button
                  className="chip mini"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openSheet({ type: 'move', id: e.id });
                  }}
                >
                  Mover
                </button>
              }
            />
          ))}
          {list.length > PENDING_SHOWN && (
            <button className="row tappable more-row" onClick={() => setAll(!all)}>
              {all ? 'Ver menos' : `Ver todas (${list.length})`}
            </button>
          )}
        </div>
      ) : (
        <p className="hint" style={{ margin: '0 4px' }}>
          Lo que apuntes sin día o se quede sin hacer, aquí a la vista hasta que lo hagas.
        </p>
      )}
    </div>
  );
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
