import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AgendaRow } from '../components/AgendaRow';
import { openSheet } from '../components/sheets';
import { Segmented } from '../components/ui';
import { monthGrid, weekDays } from '../lib/calendar';
import { calendarDay, setCalendarDay } from '../lib/calendarState';
import { addDays, addMonths, capitalize, formatLong, formatShort, formatWeek, MONTHS, parseISODate, startOfWeek, WEEKDAY_LETTERS, WEEKDAYS, weekdayIndex } from '../lib/dates';
import { navigate, useRoute } from '../lib/router';
import { useToday } from '../lib/useToday';
import { agendaForRange, itemTitle, sortedCategories, type AgendaItem } from '../store/selectors';
import { toggleCategoryHidden, updateSettings, useApp } from '../store/store';
import type { CalendarView, ISODate } from '../store/types';

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'month', label: 'Mes' },
  { value: 'week', label: 'Semana' },
  { value: 'day', label: 'Día' },
];

/** El color de algo del calendario: su categoría, el de Google o el principal. */
function toneOf(i: AgendaItem): { className: string; style?: CSSProperties } {
  if (i.kind === 'entry') return { className: i.category ? `tone-${i.category.color}` : 'tone-primary' };
  if (i.kind === 'google') return { className: 'tone-google', style: { '--g': i.event.color ?? 'var(--primary)' } as CSSProperties };
  return { className: 'tone-pink' };
}

const isDone = (i: AgendaItem) => i.kind === 'entry' && i.done;

export function Calendar() {
  const state = useApp();
  const today = useToday();
  const route = useRoute();
  const view = state.settings.calendarView ?? 'month';
  const [day, setDay] = useState<ISODate>(() => route.query.get('dia') ?? calendarDay() ?? today);
  useEffect(() => setCalendarDay(day), [day]);

  const setView = (v: CalendarView) => updateSettings({ calendarView: v });
  const move = (n: number) => setDay((d) => (view === 'month' ? addMonths(`${d.slice(0, 7)}-01`, n) : addDays(d, view === 'week' ? 7 * n : n)));
  const goToday = () => setDay(today);

  const d = parseISODate(day);
  const atToday = view === 'month' ? day.slice(0, 7) === today.slice(0, 7) : view === 'week' ? startOfWeek(day) === startOfWeek(today) : day === today;
  const openDay = (x: ISODate) => {
    setDay(x);
    setView('day');
  };
  const title =
    view === 'month' ? `${capitalize(MONTHS[d.getMonth()])} ${d.getFullYear()}` : view === 'week' ? formatWeek(startOfWeek(day)) : capitalize(formatShort(day));

  // Deslizar a los lados para cambiar de mes, semana o día
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }),
    onTouchEnd: (e: React.TouchEvent) => {
      const t = touch.current;
      touch.current = null;
      if (!t) return;
      const dx = e.changedTouches[0].clientX - t.x;
      const dy = e.changedTouches[0].clientY - t.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
    },
  };

  return (
    <div className={`screen cal-screen cal-${view}`}>
      <div className="cal-head">
        <h1>{title}</h1>
        <div className="actions">
          {!atToday && (
            <button className="btn small secondary" onClick={goToday}>
              Hoy
            </button>
          )}
          <button className="icon-btn small plain" aria-label="Anterior" onClick={() => move(-1)}>
            <ChevronLeft size={22} />
          </button>
          <button className="icon-btn small plain" aria-label="Siguiente" onClick={() => move(1)}>
            <ChevronRight size={22} />
          </button>
          <button className="icon-btn small plain" aria-label="Buscar" onClick={() => navigate('/buscar')}>
            <Search size={19} />
          </button>
        </div>
      </div>
      <Segmented value={view} onChange={setView} options={VIEWS} />
      <CategoryFilter />
      <div className="cal-body" {...swipe}>
        {view === 'month' && <MonthView day={day} today={today} onSelect={setDay} onOpenDay={openDay} />}
        {view === 'week' && <WeekView day={day} today={today} onOpenDay={openDay} />}
        {view === 'day' && <DayView day={day} />}
      </div>
    </div>
  );
}

/** Las categorías, para ver u ocultar cada una en el calendario. */
function CategoryFilter() {
  const state = useApp();
  const cats = sortedCategories(state);
  if (!cats.length) return null;
  const hidden = new Set(state.settings.hiddenCategories ?? []);
  return (
    <div className="chips scroll cat-filter" role="group" aria-label="Categorías que se ven">
      {cats.map((c) => (
        <button key={c.id} className={`chip mini cat-chip tone-${c.color} ${hidden.has(c.id) ? 'off' : 'on'}`} aria-pressed={!hidden.has(c.id)} onClick={() => toggleCategoryHidden(c.id)}>
          <i aria-hidden />
          {c.emoji ? `${c.emoji} ` : ''}
          {c.name}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Mes                                                                */
/* ---------------------------------------------------------------- */

const MONTH_CHIPS = 3;

function MonthView({ day, today, onSelect, onOpenDay }: { day: ISODate; today: ISODate; onSelect: (d: ISODate) => void; onOpenDay: (d: ISODate) => void }) {
  const state = useApp();
  const weeks = useMemo(() => monthGrid(day), [day]);
  const data = useMemo(() => agendaForRange(state, weeks[0][0], weeks.at(-1)![6], { hideHidden: true }), [state, weeks]);
  const month = day.slice(0, 7);
  const items = data.get(day) ?? [];
  return (
    <>
      <div className="month" role="grid" aria-label="Mes">
        <div className="month-head" role="row">
          {WEEKDAY_LETTERS.map((l) => (
            <span key={l} role="columnheader">
              {l}
            </span>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w[0]} className="month-week" role="row">
            {w.map((d) => {
              const list = data.get(d) ?? [];
              const n = Number(d.slice(8));
              return (
                <button
                  key={d}
                  role="gridcell"
                  className={`mday ${d.slice(0, 7) !== month ? 'other' : ''} ${d === today ? 'today' : ''} ${d === day ? 'sel' : ''}`}
                  aria-label={`${capitalize(formatLong(d))}: ${list.length ? `${list.length} ${list.length === 1 ? 'cosa' : 'cosas'}` : 'nada'}`}
                  aria-selected={d === day}
                  onClick={() => (d === day ? onOpenDay(d) : onSelect(d))}
                >
                  <span className="mnum">{n}</span>
                  {list.slice(0, list.length > MONTH_CHIPS ? MONTH_CHIPS - 1 : MONTH_CHIPS).map((i) => {
                    const t = toneOf(i);
                    return (
                      <span key={i.key} className={`mchip ${t.className} ${isDone(i) ? 'done' : ''}`} style={t.style}>
                        {i.kind === 'birthday' ? '🎂 ' : ''}
                        {i.kind === 'birthday' ? i.birthday.name : itemTitle(i)}
                      </span>
                    );
                  })}
                  {list.length > MONTH_CHIPS && <span className="mmore">+{list.length - MONTH_CHIPS + 1}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <DayList day={day} items={items} today={today} />
    </>
  );
}

/** Lo de un día, en lista (debajo del mes). */
function DayList({ day, items, today }: { day: ISODate; items: AgendaItem[]; today: ISODate }) {
  return (
    <div className="section cal-daylist">
      <div className="section-head">
        <h2>{day === today ? `Hoy · ${WEEKDAYS[weekdayIndex(day)]} ${Number(day.slice(8))}` : capitalize(formatLong(day))}</h2>
        <button className="icon-btn small primary" aria-label="Añadir este día" onClick={() => openSheet({ type: 'quick', date: day })}>
          <Plus size={18} />
        </button>
      </div>
      {items.length ? (
        <div className="list">
          {items.map((i) => (
            <AgendaRow key={i.key} item={i} />
          ))}
        </div>
      ) : (
        <button className="card empty-day" onClick={() => openSheet({ type: 'quick', date: day })}>
          Nada este día · <b>Añadir algo</b>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Semana y día: en lista, una cosa detrás de otra                    */
/* ---------------------------------------------------------------- */

function WeekView({ day, today, onOpenDay }: { day: ISODate; today: ISODate; onOpenDay: (d: ISODate) => void }) {
  const state = useApp();
  const days = useMemo(() => weekDays(day), [day]);
  const data = useMemo(() => agendaForRange(state, days[0], days[6], { hideHidden: true }), [state, days]);
  return (
    <div className="week-list">
      {days.map((d) => {
        const items = data.get(d) ?? [];
        return (
          <section key={d} className={`wday ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${items.length ? '' : 'free'}`}>
            <div className="wday-head">
              <button className="plain-btn wday-name" onClick={() => onOpenDay(d)} aria-label={`Ver el ${formatLong(d)}`}>
                <b>
                  {capitalize(WEEKDAYS[weekdayIndex(d)])} {Number(d.slice(8))}
                </b>
                {d === today && <span className="wday-hoy">Hoy</span>}
                {!items.length && <span className="wday-free">Nada</span>}
              </button>
              <button className="icon-btn small plain" aria-label={`Añadir el ${formatLong(d)}`} onClick={() => openSheet({ type: 'quick', date: d })}>
                <Plus size={18} />
              </button>
            </div>
            {items.length > 0 && (
              <div className="list">
                {items.map((i) => (
                  <AgendaRow key={i.key} item={i} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayView({ day }: { day: ISODate }) {
  const state = useApp();
  const items = useMemo(() => agendaForRange(state, day, day, { hideHidden: true }).get(day) ?? [], [state, day]);
  const add = () => openSheet({ type: 'quick', date: day });
  if (!items.length)
    return (
      <button className="card empty-day" onClick={add}>
        Nada este día · <b>Añadir algo</b>
      </button>
    );
  return (
    <>
      <div className="list">
        {items.map((i) => (
          <AgendaRow key={i.key} item={i} />
        ))}
      </div>
      <button className="btn secondary small mt12" onClick={add}>
        <Plus size={16} /> Añadir este día
      </button>
    </>
  );
}
