import { Plus, RefreshCw, Search } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AgendaRow, EntryRow } from '../components/AgendaRow';
import { DayView } from '../components/DayView';
import { MacroSummary } from '../components/MacroSummary';
import { GoalRow } from '../components/GoalRow';
import { openSheet } from '../components/sheets';
import { Empty, SectionHead } from '../components/ui';
import { addDays, capitalize, formatLong, formatRelative, formatShort, greeting, toISODate } from '../lib/dates';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { currentPeriod, daysLeft, eur, eurInt, occurrencesIn, payDue, summarizePeriod } from '../lib/finance';
import { sumMacros } from '../lib/foods';
import { HabitsToday } from '../modules/HabitsModule';
import { MovementSheet } from '../sheets/MovementSheet';
import type { ModuleKey, TodaySection } from '../store/types';
import { resolveLayout } from '../lib/todayLayout';
import { useToday } from '../lib/useToday';
import { agendaForDate, areaMap, inboxTasks, overdueEntries, sortedAreas, todaysMenu, upcomingAgenda } from '../store/selectors';
import { getState, useApp } from '../store/store';
import { GoogleBanner, GoogleStatusButton } from './GoogleStatus';
import { WeekCard } from './Week';

export function Today() {
  const state = useApp();
  const today = useToday();
  const route = useRoute();
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [showAllInbox, setShowAllInbox] = useState(false);
  const [dayState, setDay] = useState<{ base: string; date: string } | null>(null);
  // El día elegido vuelve a «hoy» cuando cambia la fecha (medianoche).
  const day = dayState && dayState.base === today ? dayState.date : today;

  // Enlaces directos: #/hoy?nuevo=1, #/hoy?ver=<id> (desde un aviso)
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
      // Atajos del icono de la app
      clearQuery('accion');
      const s = getState();
      const area = (m: ModuleKey) => sortedAreas(s).find((a) => a.modules.includes(m));
      if (accion === 'gasto') openSheet({ type: 'movement', scope: 'personal', kind: 'gasto' });
      else if (accion === 'compra') {
        const a = area('shopping');
        navigate(a ? `/areas/${a.id}?bloque=shopping` : '/areas');
      } else if (accion === 'comida') {
        const a = area('diary');
        navigate(a ? `/areas/${a.id}?bloque=diary&nuevo=1` : '/areas');
      } else if (accion === 'buscar') navigate('/buscar');
    }
  }, [ver, nuevo, accion]);

  const areas = useMemo(() => areaMap(state), [state]);
  const items = useMemo(() => agendaForDate(state, today, areas), [state, today, areas]);
  const birthdays = items.filter((i) => i.kind === 'birthday');
  const agenda = items.filter((i) => i.kind !== 'birthday');

  const overdue = useMemo(() => overdueEntries(state, today), [state, today]);
  const inbox = useMemo(() => inboxTasks(state), [state]);
  const menus = sortedAreas(state)
    .filter((a) => a.showOnToday && a.modules.includes('menu'))
    .map((a) => ({ area: a, meals: todaysMenu(a, day) }))
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

  const blocks: Record<TodaySection, ReactNode> = {
    dayview: (
      <div className="section">
        <SectionHead
          title="Día a vista"
          count={day === today ? pendingCount : undefined}
          action={
            <button className="link-btn" onClick={() => navigate('/agenda')}>
              Semana
            </button>
          }
        />
        <DayView date={day} today={today} onDateChange={(d) => setDay({ base: today, date: d })} />
      </div>
    ),
    shopping: <ShoppingPeek />,
    overdue: overdue.length > 0 && (
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
    ),
    week: <WeekCard today={today} />,
    habits: <HabitsToday today={today} />,
    menu: menus.map(({ area, meals }) => (
      <div className="section" key={area.id}>
        <SectionHead
          title={`${area.emoji} Menú de ${day === today ? 'hoy' : day === addDays(today, 1) ? 'mañana' : formatShort(day)}`}
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
    )),
    diary: <MacrosPeek today={today} />,
    money: <FinancePeek today={today} />,
    goals: goals.length > 0 && (
      <div className="section">
        <SectionHead title="Objetivos" />
        <div className="list">
          {goals.map((g) => (
            <GoalRow key={g.id} goal={g} area={g.areaId ? areas.get(g.areaId) : undefined} date={today} />
          ))}
        </div>
      </div>
    ),
    inbox: (
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
    ),
    upcoming: upcoming.length > 0 && (
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
    ),
  };
  const layout = resolveLayout(state.settings.todayLayout);

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

      {layout.map(({ key, hidden }) => (hidden ? null : <Fragment key={key}>{blocks[key]}</Fragment>))}

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

/** La lista de la compra, a mano desde Hoy. */
function ShoppingPeek() {
  const state = useApp();
  const items = state.listItems.filter((i) => i.list === 'compra' && !i.done && !i.deleted);
  const area = sortedAreas(state).find((a) => a.modules.includes('shopping'));
  if (!items.length || !area) return null;
  const names = items.slice(0, 4).map((i) => i.text).join(', ');
  return (
    <button className="card hstack mt12" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => navigate(`/areas/${area.id}?bloque=shopping`)}>
      <span style={{ fontSize: 'calc(22px * var(--fs))' }}>🛒</span>
      <div className="grow">
        <div style={{ fontWeight: 700 }}>
          Lista de la compra · {items.length}
          {state.share ? ' · compartida' : ''}
        </div>
        <div className="small muted ellipsis">
          {names}
          {items.length > 4 ? '…' : ''}
        </div>
      </div>
    </button>
  );
}

/** Calorías y macros de hoy (si se usa el diario de comidas). */
function MacrosPeek({ today }: { today: string }) {
  const state = useApp();
  const area = sortedAreas(state).find((a) => a.showOnToday && a.modules.includes('diary'));
  const logs = state.foodLog.filter((l) => l.date === today);
  const targets = state.nutritionTargets;
  if (!area || (!logs.length && !targets.kcal)) return null;
  const open = () => navigate(`/areas/${area.id}?bloque=diary`);
  return (
    <div className="section">
      <SectionHead
        title={`${area.emoji} Calorías de hoy`}
        action={
          <button className="link-btn" onClick={open}>
            Apuntar
          </button>
        }
      />
      <div className={`card tone-${area.color}`} role="button" tabIndex={0} onClick={open} style={{ cursor: 'pointer' }}>
        <MacroSummary total={sumMacros(logs)} targets={targets} compact />
      </div>
    </div>
  );
}

/** Lo gastado en el periodo y los fijos que se cargan hoy o mañana. */
function FinancePeek({ today }: { today: string }) {
  const state = useApp();
  const [adding, setAdding] = useState(false);
  const area = sortedAreas(state).find((a) => a.showOnToday && a.modules.includes('money'));
  if (!area) return null;
  const fin = state.finance;
  const acc = fin.accounts.personal;
  const period = currentPeriod(acc, today);
  const s = summarizePeriod(fin, 'personal', period, today);
  const soon = occurrencesIn(fin.recurring, fin.movements, today, addDays(today, 1), today).filter((o) => !o.movement && o.recurring.kind === 'gasto');
  if (!acc.periodStarts.length && !s.movements.length && !soon.length) return null;
  const left = daysLeft(period, today);
  const total = acc.budgetTotal;
  const over = total !== undefined && s.spent > total;
  return (
    <div className="section">
      <SectionHead
        title={`${area.emoji} ${area.name}`}
        action={
          <button className="link-btn" onClick={() => setAdding(true)}>
            + Gasto
          </button>
        }
      />
      <div className={`card tone-${area.color}`} role="button" tabIndex={0} onClick={() => navigate(`/areas/${area.id}?bloque=money`)} style={{ cursor: 'pointer' }}>
        <div className="ms-head">
          <div>
            <div className="ms-label">Gastado este periodo</div>
            <div className="ms-hero" style={{ fontSize: 'calc(28px * var(--fs))' }}>
              {eurInt(s.spent)}
              {total !== undefined && <span className="ms-of"> de {eurInt(total)}</span>}
            </div>
          </div>
          <div className="ms-left">
            {payDue(acc, today) ? '¿Has cobrado ya?' : left > 0 ? `Quedan ${left} ${left === 1 ? 'día' : 'días'}` : 'Esperando el cobro'}
            {total !== undefined && !over && <div className="tiny">{eurInt(total - s.spent)} libres</div>}
          </div>
        </div>
        {total !== undefined && (
          <div className={`meter mt8 ${over ? 'over' : ''}`}>
            <div style={{ width: `${Math.min(100, (s.spent / total) * 100)}%` }} />
          </div>
        )}
        {soon.map((o) => (
          <div key={`${o.recurring.id}-${o.date}`} className="small muted mt8">
            📆 {o.date === today ? 'Hoy' : 'Mañana'} se carga {o.recurring.name} ({eur(o.amount)}){o.recurring.scope === 'hogar' ? ', cuenta conjunta' : ''}
          </div>
        ))}
      </div>
      {adding && <MovementSheet scope="personal" kind="gasto" onClose={() => setAdding(false)} />}
    </div>
  );
}
