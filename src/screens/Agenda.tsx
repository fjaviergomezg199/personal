import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { AgendaRow } from '../components/AgendaRow';
import { openSheet } from '../components/sheets';
import { Empty, Segmented } from '../components/ui';
import { addDays, capitalize, formatDayMonth, formatLong, formatRelative, MONTHS_SHORT, parseISODate, startOfWeek, WEEKDAY_LETTERS } from '../lib/dates';
import { navigate, useRoute } from '../lib/router';
import { useToday } from '../lib/useToday';
import { agendaForDate, areaMap, upcomingAgenda, upcomingBirthdays, type AgendaItem } from '../store/selectors';
import { useApp } from '../store/store';
import { GoogleStatusButton } from './GoogleStatus';

type View = 'semana' | 'lista' | 'cumples';

export function Agenda() {
  const route = useRoute();
  const today = useToday();
  const view = (route.query.get('vista') as View) || 'semana';
  const setView = (v: View) => navigate(`/agenda?vista=${v}`, { replace: true });

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1>Agenda</h1>
        </div>
        <div className="actions">
          <GoogleStatusButton />
          <button className="icon-btn primary" aria-label="Añadir" onClick={() => openSheet(view === 'cumples' ? { type: 'birthday' } : { type: 'quick' })}>
            <Plus size={20} />
          </button>
        </div>
      </div>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'semana', label: 'Semana' },
          { value: 'lista', label: 'Próximo' },
          { value: 'cumples', label: '🎂 Cumpleaños' },
        ]}
      />
      <div className="mt16">
        {view === 'semana' && <WeekView today={today} />}
        {view === 'lista' && <ListView today={today} />}
        {view === 'cumples' && <BirthdaysView today={today} />}
      </div>
    </div>
  );
}

function WeekView({ today }: { today: string }) {
  const state = useApp();
  const route = useRoute();
  const weekStart = startOfWeek(route.query.get('semana') ?? today);
  const setWeek = (iso: string) => navigate(`/agenda?vista=semana&semana=${iso}`, { replace: true });
  const areas = useMemo(() => areaMap(state), [state]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => ({ date: d, items: agendaForDate(state, d, areas) })),
    [state, weekStart, areas],
  );
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const isThisWeek = weekStart === startOfWeek(today);

  useEffect(() => {
    if (isThisWeek) {
      const el = refs.current[today];
      if (el && today !== weekStart) el.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    }
    // Solo al entrar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const end = addDays(weekStart, 6);
  const s = parseISODate(weekStart);
  const e = parseISODate(end);
  const label =
    s.getMonth() === e.getMonth()
      ? `${s.getDate()} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`
      : `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`;

  return (
    <div>
      <div className="sticky-week">
      <div className="card" style={{ padding: '10px 8px' }}>
        <div className="week-nav">
          <button className="icon-btn small plain" aria-label="Semana anterior" onClick={() => setWeek(addDays(weekStart, -7))}>
            <ChevronLeft size={20} />
          </button>
          <div className="t">{label}</div>
          {!isThisWeek ? (
            <button className="link-btn" onClick={() => setWeek(today)}>
              Hoy
            </button>
          ) : (
            <span style={{ width: 32 }} />
          )}
          <button className="icon-btn small plain" aria-label="Semana siguiente" onClick={() => setWeek(addDays(weekStart, 7))}>
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="week-strip">
          {days.map(({ date, items }, i) => (
            <button
              key={date}
              className={`day-pill ${date === today ? 'today' : ''}`}
              onClick={() => refs.current[date]?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
              aria-label={formatLong(date)}
            >
              <span className="l">{WEEKDAY_LETTERS[i]}</span>
              <span className="n">{parseISODate(date).getDate()}</span>
              <span className="dots">
                {items.slice(0, 3).map((it) => (
                  <i key={it.key} style={dotStyle(it)} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
      </div>

      {days.map(({ date, items }) => (
        <div key={date} ref={(el) => void (refs.current[date] = el)} style={{ scrollMarginTop: 'calc(var(--safe-t) + 150px)' }}>
          <div className={`day-head hstack ${date === today ? 'today' : ''}`}>
            <span className="grow">{capitalize(`${date === today ? 'hoy · ' : date === addDays(today, 1) ? 'mañana · ' : ''}${formatLong(date)}`)}</span>
            <button className="icon-btn small plain" aria-label={`Añadir el ${formatLong(date)}`} onClick={() => openSheet({ type: 'quick', date })}>
              <Plus size={18} />
            </button>
          </div>
          {items.length ? (
            <div className="list">
              {items.map((it) => (
                <AgendaRow key={it.key} item={it} />
              ))}
            </div>
          ) : (
            <div className="faint small" style={{ margin: '0 4px' }}>
              Nada apuntado
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function dotStyle(it: AgendaItem): React.CSSProperties {
  if (it.kind === 'birthday') return { background: 'var(--c-pink)' };
  if (it.kind === 'google') return { background: it.event.color ?? 'var(--c-blue)' };
  if (it.kind === 'plan') return { background: `var(--c-${it.area.color})` };
  if (it.kind === 'entry' && it.area) return { background: `var(--c-${it.area.color})` };
  return { background: 'var(--primary)' };
}

function ListView({ today }: { today: string }) {
  const state = useApp();
  const days = useMemo(
    () =>
      upcomingAgenda(state, today, 90)
        .map((d) => ({ ...d, items: d.items.filter((i) => i.kind !== 'plan' && !(i.kind === 'entry' && i.done)) }))
        .filter((d) => d.items.length),
    [state, today],
  );
  if (!days.length)
    return (
      <div className="card">
        <Empty emoji="🗓️" title="Nada en los próximos meses" text="Apunta planes, conciertos, viajes o recordatorios y aparecerán aquí en orden." />
      </div>
    );
  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Recordatorios, planes, cumpleaños y eventos de los próximos 3 meses (sin las sesiones de las áreas).
      </p>
      {days.map(({ date, items }) => (
        <div key={date}>
          <div className={`day-head ${date === today ? 'today' : ''}`}>
            {formatRelative(date, today)}
            {date === today || date === addDays(today, 1) || date === addDays(today, 2) ? ` · ${formatDayMonth(date, today)}` : ''}
          </div>
          <div className="list">
            {items.map((it) => (
              <AgendaRow key={it.key} item={it} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BirthdaysView({ today }: { today: string }) {
  const state = useApp();
  const list = useMemo(() => upcomingBirthdays(state, today), [state, today]);
  if (!list.length)
    return (
      <div className="card">
        <Empty
          emoji="🎂"
          title="Sin cumpleaños apuntados"
          text="Escribe «cumple de Marta 12/03» en el botón + y listo. Te avisará antes."
          action={
            <button className="btn small" onClick={() => openSheet({ type: 'birthday' })}>
              <Plus size={16} /> Añadir cumpleaños
            </button>
          }
        />
      </div>
    );
  return (
    <div className="list">
      {list.map(({ birthday: b, date, inDays, age }) => (
        <div key={b.id} className="row tappable" role="button" tabIndex={0} onClick={() => openSheet({ type: 'birthday', id: b.id })}>
          <div className="lead" aria-hidden>
            {inDays === 0 ? '🎉' : '🎂'}
          </div>
          <div className="body">
            <div className="title">{b.name}</div>
            <div className="meta">
              <span>{capitalize(formatDayMonth(date, today))}</span>
              {age && <span>cumple {age}</span>}
              {b.notes && <span className="ellipsis">🎁 {b.notes}</span>}
            </div>
          </div>
          <div className="trail">
            <span className={inDays <= 7 ? 'badge tone-pink' : 'tiny'}>{inDays === 0 ? '¡Hoy!' : inDays === 1 ? 'Mañana' : `en ${inDays} días`}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
