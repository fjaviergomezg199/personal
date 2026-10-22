import { Plus, RefreshCw, Search } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AgendaRow, EntryRow } from '../components/AgendaRow';
import { DayView } from '../components/DayView';
import { GoalRow } from '../components/GoalRow';
import { openSheet } from '../components/sheets';
import { Empty, SectionHead, toast } from '../components/ui';
import { addDays, capitalize, formatLong, formatRelative, formatShort, greeting, toISODate } from '../lib/dates';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { currentPeriod, daysLeft, eur, eurInt, occurrencesIn, payDue, summarizePeriod } from '../lib/finance';
import { mealForNow, mealsForDay, menuMealItems } from '../lib/diary';
import { macrosFor, sumMacros } from '../lib/foods';
import { HabitsToday } from '../modules/HabitsModule';
import { AddFoodSheet } from '../sheets/AddFoodSheet';
import { CloseDaySheet } from '../sheets/CloseDaySheet';
import { closeDayCardDay, closeDayLinkDay } from '../lib/closeDay';
import { MovementSheet } from '../sheets/MovementSheet';
import type { Area, ModuleKey, TodaySection } from '../store/types';
import { resolveLayout, SIMPLE_SECTIONS } from '../lib/todayLayout';
import { useTick, useToday } from '../lib/useToday';
import { agendaForDate, areaMap, inboxTasks, overdueEntries, sortedAreas, todaysMenu, upcomingAgenda } from '../store/selectors';
import { addFoodLog, deleteFoodLog, getState, updateEntry, updateSettings, useApp } from '../store/store';
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
  const cerrar = route.query.get('cerrar');
  /** El día que se está cerrando (con la hoja abierta). */
  const [closing, setClosing] = useState<string | null>(null);
  useEffect(() => {
    if (ver) {
      clearQuery('ver');
      // El aviso de «Cerrar el día» abre el cierre, no el recordatorio
      if (getState().entries.find((e) => e.id === ver)?.ritual) setClosing(closeDayLinkDay(new Date()));
      else openSheet({ type: 'entry', id: ver });
    } else if (cerrar) {
      clearQuery('cerrar');
      setClosing(closeDayLinkDay(new Date()));
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
  }, [ver, nuevo, accion, cerrar]);

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
    close: <CloseDayCard onStart={setClosing} />,
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
    // Sin culpa: una línea, y a un toque pasarlo todo a hoy.
    overdue: overdue.length > 0 && (
      <div className="section">
        {showAllOverdue ? (
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
                  area={e.areaId ? areas.get(e.areaId) : undefined}
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
            <button className="link-btn mt8" onClick={() => setShowAllOverdue(false)}>
              Ver menos
            </button>
          </>
        ) : (
          <div className="card hstack overdue-line">
            <div className="grow small" role="button" tabIndex={0} onClick={() => setShowAllOverdue(true)} style={{ minWidth: 0, cursor: 'pointer' }}>
              <b>{overdue.length === 1 ? 'Te quedó 1 cosa de otro día' : `Te quedaron ${overdue.length} cosas de otros días`}</b>
              <div className="muted ellipsis">{overdue.map((e) => e.title).join(' · ')}</div>
            </div>
            <button className="btn small secondary" onClick={() => moveToToday(overdue.map((e) => e.id), today)}>
              A hoy
            </button>
          </div>
        )}
      </div>
    ),
    week: <WeekCard today={today} />,
    habits: <HabitsToday today={today} />,
    menu: menus.map(({ area, meals }) => <MenuToday key={area.id} area={area} meals={meals} day={day} today={today} />),
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
              {(showAllInbox ? inbox : inbox.slice(0, 3)).map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </div>
            {inbox.length > 3 && (
              <button className="link-btn mt8" onClick={() => setShowAllInbox(!showAllInbox)}>
                {showAllInbox ? 'Ver menos' : `Ver ${inbox.length - 3} más`}
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
  const simple = !!state.settings.simpleToday;
  const layout = resolveLayout(state.settings.todayLayout).filter((l) => !simple || SIMPLE_SECTIONS.includes(l.key));

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

      {groupTiles(layout.filter((l) => !l.hidden).map((l) => l.key)).map((g) =>
        Array.isArray(g) ? (
          <div key={g.join('-')} className="tiles">
            {g.map((k) => (
              <Fragment key={k}>{blocks[k]}</Fragment>
            ))}
          </div>
        ) : (
          <Fragment key={g}>{blocks[g]}</Fragment>
        ),
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
      <p className="hint center mt24">
        <button className="link-btn" style={{ padding: 0 }} onClick={() => updateSettings({ simpleToday: !simple })}>
          {simple ? 'Ver Hoy completo' : '¿Mucho? Ver Hoy en modo sencillo'}
        </button>
      </p>
      <RefreshHint />
      {closing && <CloseDaySheet day={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}

/** Por la noche (hasta que se cierre el día): un minuto, todo con sí o no. */
function CloseDayCard({ onStart }: { onStart: (day: string) => void }) {
  const state = useApp();
  useTick(60000); // para que salga a su hora con la app abierta
  const day = closeDayCardDay(state, new Date());
  if (!day) return null;
  return (
    <div className="banner tone-violet mt12 close-card" role="button" tabIndex={0} onClick={() => onStart(day)} onKeyDown={(e) => e.key === 'Enter' && onStart(day)}>
      <div className="big" aria-hidden>
        🌙
      </div>
      <div className="grow">
        <div className="t">Cerrar el día</div>
        <div className="d">Un minuto, todo con sí o no.</div>
      </div>
      <span className="btn small tone">Empezar</span>
    </div>
  );
}

/** Pasar a hoy lo que quedó de otros días (sin hora: es «para hoy»), con deshacer. */
function moveToToday(ids: string[], today: string) {
  const before = getState().entries.filter((e) => ids.includes(e.id)).map(({ id, date, time, endTime, alert }) => ({ id, date, time, endTime, alert }));
  for (const id of ids) updateEntry(id, { date: today, time: undefined, endTime: undefined, alert: null });
  toast(before.length === 1 ? 'Pasado a hoy' : `${before.length} cosas pasadas a hoy`, {
    action: 'Deshacer',
    onAction: () => before.forEach(({ id, ...prev }) => updateEntry(id, prev)),
  });
}

/** Bloques que en Hoy son tarjetas pequeñas: si van seguidos, se ponen de dos en dos. */
const TILES = new Set<TodaySection>(['shopping', 'diary', 'money']);

function groupTiles(keys: TodaySection[]): (TodaySection | TodaySection[])[] {
  const out: (TodaySection | TodaySection[])[] = [];
  for (const k of keys) {
    const last = out[out.length - 1];
    if (TILES.has(k) && Array.isArray(last)) last.push(k);
    else out.push(TILES.has(k) ? [k] : k);
  }
  return out;
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

/**
 * El menú en Hoy: la comida que toca (y la siguiente), no el día entero. Con el
 * diario de comidas, «✓ Comido» la apunta de un toque.
 */
function MenuToday({ area, meals, day, today }: { area: Area; meals: { meal: string; text: string }[]; day: string; today: string }) {
  const state = useApp();
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState<{ meal: string; menuText: string } | null>(null);
  const isToday = day === today;
  const canLog = isToday && state.areas.some((a) => a.modules.includes('diary'));
  const logs = state.foodLog.filter((l) => l.date === today);
  const logged = (meal: string) => logs.some((l) => l.meal === meal);

  let shown = meals;
  if (isToday && !all) {
    // La que toca y la siguiente; y la anterior si aún no se ha apuntado (¿la comiste?)
    const cur = Math.max(0, meals.findIndex((m) => m.meal === mealForNow(meals.map((x) => x.meal))));
    const start = canLog && cur > 0 && !logged(meals[cur - 1].meal) ? cur - 1 : cur;
    shown = meals.slice(start, cur + 2);
  }

  const eat = (m: { meal: string; text: string }) => {
    const items = menuMealItems(m.text, state.customFoods);
    if (!items) return setAdding({ meal: m.meal, menuText: m.text });
    const ids = addFoodLog(items.map(({ food, grams }) => ({ date: today, meal: m.meal, name: food.name, grams: Math.round(grams), foodId: food.key, ...macrosFor(food, grams) })));
    const kcal = Math.round(sumMacros(items.map((x) => macrosFor(x.food, x.grams))).kcal);
    toast(`${m.meal} apuntada · ${kcal.toLocaleString('es-ES')} kcal`, { action: 'Deshacer', onAction: () => deleteFoodLog(ids) });
  };

  return (
    <div className="section">
      <SectionHead
        title={`${area.emoji} Menú de ${isToday ? 'hoy' : day === addDays(today, 1) ? 'mañana' : formatShort(day)}`}
        action={
          <button className="link-btn" onClick={() => navigate(`/areas/${area.id}?bloque=menu`)}>
            Semana
          </button>
        }
      />
      <div className={`card tone-${area.color}`}>
        {shown.map((m) => (
          <div className="meal meal-today" key={m.meal}>
            <div className="mt-head">
              <div className="m">{m.meal}</div>
              {canLog &&
                (logged(m.meal) ? (
                  <span className="badge tone-green">✓ Apuntado</span>
                ) : (
                  <button className="chip mini" onClick={() => eat(m)} aria-label={`Apuntar ${m.meal.toLowerCase()} del menú`}>
                    ✓ Comido
                  </button>
                ))}
            </div>
            <div className="x">{m.text}</div>
          </div>
        ))}
        {isToday && meals.length > shown.length && (
          <button className="link-btn mt8" style={{ padding: 0 }} onClick={() => setAll(true)}>
            Ver todo el día ({meals.length} comidas)
          </button>
        )}
      </div>
      {adding && (
        <AddFoodSheet date={today} meal={adding.meal} meals={mealsForDay(meals.map((m) => m.meal), logs)} menuText={adding.menuText} onClose={() => setAdding(null)} />
      )}
    </div>
  );
}

/** Tarjeta pequeña de Hoy: un dato de un vistazo, un toque para abrirlo y, si se puede, «+» para apuntar. */
function Tile(props: {
  emoji: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Parte usada (0–1); más de 1 es pasarse. */
  meter?: number;
  tone?: string;
  onOpen: () => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div
      className={`tile ${props.tone ? `tone-${props.tone}` : ''}`}
      role="button"
      tabIndex={0}
      onClick={props.onOpen}
      onKeyDown={(e) => e.key === 'Enter' && props.onOpen()}
    >
      <div className="tile-head">
        <span>
          {props.emoji} {props.label}
        </span>
        {props.onAdd && (
          <button
            className="tile-add"
            aria-label={props.addLabel}
            onClick={(e) => {
              e.stopPropagation();
              props.onAdd?.();
            }}
          >
            <Plus size={17} />
          </button>
        )}
      </div>
      <div className="tile-value">{props.value}</div>
      {props.meter !== undefined && (
        <div className={`meter ${props.meter > 1 ? 'over' : ''}`} role="img" aria-label={`${Math.round(props.meter * 100)} %`}>
          <div style={{ width: `${Math.min(100, props.meter * 100)}%` }} />
        </div>
      )}
      {props.sub && <div className="tile-sub">{props.sub}</div>}
    </div>
  );
}

/** La lista de la compra, a mano desde Hoy. */
function ShoppingPeek() {
  const state = useApp();
  const items = state.listItems.filter((i) => i.list === 'compra' && !i.done && !i.deleted);
  const area = sortedAreas(state).find((a) => a.modules.includes('shopping'));
  if (!items.length || !area) return null;
  return (
    <Tile
      emoji="🛒"
      label={state.share ? 'Compra (los dos)' : 'Compra'}
      value={
        <>
          {items.length} <small>{items.length === 1 ? 'cosa' : 'cosas'}</small>
        </>
      }
      sub={items.map((i) => i.text).join(', ')}
      tone={area.color}
      onOpen={() => navigate(`/areas/${area.id}?bloque=shopping`)}
    />
  );
}

/** Calorías de hoy (si se usa el diario de comidas). */
function MacrosPeek({ today }: { today: string }) {
  const state = useApp();
  const area = sortedAreas(state).find((a) => a.showOnToday && a.modules.includes('diary'));
  const logs = state.foodLog.filter((l) => l.date === today);
  const targets = state.nutritionTargets;
  if (!area || (!logs.length && !targets.kcal)) return null;
  const kcal = Math.round(sumMacros(logs).kcal);
  const target = targets.kcal;
  return (
    <Tile
      emoji="🔥"
      label="Calorías"
      value={
        <>
          {kcal.toLocaleString('es-ES')}
          {target ? <small> / {target.toLocaleString('es-ES')}</small> : <small> kcal</small>}
        </>
      }
      meter={target ? kcal / target : undefined}
      sub={target ? (kcal <= target ? `Quedan ${(target - kcal).toLocaleString('es-ES')}` : `${(kcal - target).toLocaleString('es-ES')} de más`) : logs.length ? undefined : 'Nada apuntado'}
      tone={area.color}
      onOpen={() => navigate(`/areas/${area.id}?bloque=diary`)}
      onAdd={() => navigate(`/areas/${area.id}?bloque=diary&nuevo=1`)}
      addLabel="Apuntar lo que he comido"
    />
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
  const next = soon[0];
  return (
    <>
      <Tile
        emoji="💶"
        label="Gastado"
        value={
          <>
            {eurInt(s.spent)}
            {total !== undefined && <small> de {eurInt(total)}</small>}
          </>
        }
        meter={total ? s.spent / total : undefined}
        sub={
          next
            ? `📆 ${next.date === today ? 'Hoy' : 'Mañana'}: ${next.recurring.name} (${eur(next.amount)})`
            : payDue(acc, today)
              ? '¿Has cobrado ya?'
              : left > 0
                ? `Quedan ${left} ${left === 1 ? 'día' : 'días'}`
                : 'Esperando el cobro'
        }
        tone={area.color}
        onOpen={() => navigate(`/areas/${area.id}?bloque=money`)}
        onAdd={() => setAdding(true)}
        addLabel="Apuntar un gasto"
      />
      {adding && <MovementSheet scope="personal" kind="gasto" onClose={() => setAdding(false)} />}
    </>
  );
}
