import { Plus, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AgendaRow, EntryRow } from '../components/AgendaRow';
import { GoalRow } from '../components/GoalRow';
import { openSheet } from '../components/sheets';
import { Empty, SectionHead } from '../components/ui';
import { addDays, capitalize, formatLong, formatRelative, greeting, toISODate } from '../lib/dates';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { useToday } from '../lib/useToday';
import { agendaForDate, areaMap, inboxTasks, overdueEntries, sortedAreas, todaysMenu, upcomingAgenda } from '../store/selectors';
import { useApp } from '../store/store';
import { GoogleBanner, GoogleStatusButton } from './GoogleStatus';

export function Today() {
  const state = useApp();
  const today = useToday();
  const route = useRoute();
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [showAllInbox, setShowAllInbox] = useState(false);

  // Enlaces directos: #/hoy?nuevo=1, #/hoy?ver=<id> (desde un aviso)
  const ver = route.query.get('ver');
  const nuevo = route.query.get('nuevo');
  useEffect(() => {
    if (ver) {
      clearQuery('ver');
      openSheet({ type: 'entry', id: ver });
    } else if (nuevo) {
      clearQuery('nuevo');
      openSheet({ type: 'quick' });
    }
  }, [ver, nuevo]);

  const areas = useMemo(() => areaMap(state), [state]);
  const items = useMemo(() => agendaForDate(state, today, areas), [state, today, areas]);
  const birthdays = items.filter((i) => i.kind === 'birthday');
  const agenda = items.filter((i) => i.kind !== 'birthday');
  const overdue = useMemo(() => overdueEntries(state, today), [state, today]);
  const inbox = useMemo(() => inboxTasks(state), [state]);
  const menus = sortedAreas(state)
    .filter((a) => a.showOnToday && a.modules.includes('menu'))
    .map((a) => ({ area: a, meals: todaysMenu(a, today) }))
    .filter((m) => m.meals.length);
  const goals = state.goals.filter((g) => !g.archived && g.period !== 'once' && (!g.areaId || areas.get(g.areaId)?.showOnToday !== false));
  const upcoming = useMemo(
    () =>
      upcomingAgenda(state, addDays(today, 1), 14)
        .flatMap((d) => d.items.filter((i) => i.kind === 'birthday' || i.kind === 'google' || (i.kind === 'entry' && i.entry.kind !== 'task')))
        // Lo que se repite, solo la próxima vez
        .filter((i, idx, all) => i.kind !== 'entry' || all.findIndex((x) => x.kind === 'entry' && x.entry.id === i.entry.id) === idx)
        .slice(0, 5),
    [state, today],
  );

  const pendingCount = agenda.filter((i) => (i.kind === 'entry' && i.entry.kind !== 'event') || i.kind === 'plan').filter((i) => !('done' in i && i.done)).length;
  const name = state.settings.name;

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <div className="hello">
            {greeting()}
            {name ? `, ${name}` : ''} 👋
          </div>
          <h1>Hoy</h1>
          <div className="sub">{capitalize(formatLong(today))}</div>
        </div>
        <div className="actions">
          <GoogleStatusButton />
        </div>
      </div>

      <button className="quick-bar" onClick={() => openSheet({ type: 'quick' })}>
        <Plus size={20} color="var(--primary)" />
        <span className="ph">Añade algo… «mañana a las 10 dentista»</span>
      </button>
      <GoogleBanner />

      {birthdays.map((b) =>
        b.kind === 'birthday' ? (
          <div key={b.key} className="banner tone-pink mt12" role="button" onClick={() => openSheet({ type: 'birthday', id: b.birthday.id })}>
            <div className="big">🎂</div>
            <div className="grow">
              <div className="t">Hoy es el cumpleaños de {b.birthday.name}</div>
              <div className="d">{b.age ? `Cumple ${b.age} años. ` : ''}¡No te olvides de felicitar!</div>
            </div>
          </div>
        ) : null,
      )}

      <div className="section">
        <SectionHead
          title="Agenda de hoy"
          count={pendingCount}
          action={
            <button className="link-btn" onClick={() => navigate('/agenda')}>
              Semana
            </button>
          }
        />
        {agenda.length ? (
          <div className="list">
            {agenda.map((i) => (
              <AgendaRow key={i.key} item={i} />
            ))}
          </div>
        ) : (
          <div className="card">
            <Empty
              emoji="🌤️"
              title="Nada apuntado para hoy"
              text="Añade un recordatorio o un plan, o crea tus áreas para ver aquí lo que toca cada día."
              action={
                <button className="btn small" onClick={() => openSheet({ type: 'quick', date: today })}>
                  <Plus size={16} /> Añadir
                </button>
              }
            />
          </div>
        )}
      </div>

      {overdue.length > 0 && (
        <div className="section">
          <SectionHead title="Se te pasó" count={overdue.length} />
          <div className="list">
            {(showAllOverdue ? overdue : overdue.slice(0, 3)).map((e) => (
              <EntryRow key={e.id} entry={e} area={e.areaId ? areas.get(e.areaId) : undefined} showDate overdue />
            ))}
          </div>
          {overdue.length > 3 && (
            <button className="link-btn mt8" onClick={() => setShowAllOverdue(!showAllOverdue)}>
              {showAllOverdue ? 'Ver menos' : `Ver ${overdue.length - 3} más`}
            </button>
          )}
        </div>
      )}

      {menus.map(({ area, meals }) => (
        <div className="section" key={area.id}>
          <SectionHead
            title={`${area.emoji} Menú de hoy`}
            action={
              <button className="link-btn" onClick={() => navigate(`/areas/${area.id}?bloque=menu`)}>
                Semana
              </button>
            }
          />
          <div className={`card tone-${area.color}`}>
            {meals.map((m) => (
              <div className="meal" key={m.meal}>
                <div className="m">{m.meal}</div>
                <div className="x">{m.text}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {goals.length > 0 && (
        <div className="section">
          <SectionHead title="Objetivos" />
          <div className="list">
            {goals.map((g) => (
              <GoalRow key={g.id} goal={g} area={g.areaId ? areas.get(g.areaId) : undefined} date={today} />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <SectionHead
          title="Pendientes"
          count={inbox.length}
          action={
            <button className="link-btn" onClick={() => openSheet({ type: 'quick', kind: 'task' })}>
              Añadir
            </button>
          }
        />
        {inbox.length ? (
          <>
            <div className="list">
              {(showAllInbox ? inbox : inbox.slice(0, 5)).map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </div>
            {inbox.length > 5 && (
              <button className="link-btn mt8" onClick={() => setShowAllInbox(!showAllInbox)}>
                {showAllInbox ? 'Ver menos' : `Ver ${inbox.length - 5} más`}
              </button>
            )}
          </>
        ) : (
          <div className="card small muted">Sin pendientes sueltos. Las tareas de cada área están en su página.</div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="section">
          <SectionHead
            title="Próximamente"
            action={
              <button className="link-btn" onClick={() => navigate('/agenda?vista=lista')}>
                Ver todo
              </button>
            }
          />
          <div className="list">
            {upcoming.map((i) => (
              <AgendaRow key={i.key} item={i} trail={<b>{formatRelative(i.date, today)}</b>} />
            ))}
          </div>
        </div>
      )}

      {state.areas.length === 0 && (
        <div className="section">
          <div className="card">
            <Empty
              emoji="🧩"
              title="Crea tus áreas"
              text="Estudios, running, nutrición, trabajo… Cada área tiene lo suyo y lo de cada día aparece aquí."
              action={
                <button className="btn small" onClick={() => navigate('/areas?nueva=1')}>
                  Añadir un área
                </button>
              }
            />
          </div>
        </div>
      )}
      <RefreshHint />
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
