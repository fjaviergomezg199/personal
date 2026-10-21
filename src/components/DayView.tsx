import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { addDays, capitalize, daysBetween, formatLong, makeHHMM } from '../lib/dates';
import { agendaForDate, areaMap, type AgendaItem } from '../store/selectors';
import { useApp } from '../store/store';
import type { AreaColor } from '../store/types';
import { AgendaRow, entryEmoji } from './AgendaRow';
import { openSheet } from './sheets';
import { Empty } from './ui';

const HOUR = 56; // px por hora

const CATEGORY_TONE: Record<string, AreaColor> = {
  tickets: 'amber',
  concert: 'violet',
  trip: 'blue',
  food: 'orange',
  party: 'pink',
  culture: 'violet',
  health: 'teal',
  sport: 'orange',
  study: 'violet',
  work: 'blue',
  home: 'amber',
  money: 'green',
};

interface Block {
  item: AgendaItem;
  start: number; // minutos desde las 00:00
  end: number;
  title: string;
  label: string;
  done: boolean;
  tone?: AreaColor;
  color?: string;
  col: number;
  cols: number;
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

function blockFor(item: AgendaItem): Omit<Block, 'col' | 'cols'> | null {
  if (!item.time) return null;
  const start = toMin(item.time);
  switch (item.kind) {
    case 'entry': {
      const e = item.entry;
      const end = e.endTime && toMin(e.endTime) > start ? toMin(e.endTime) : start + (e.kind === 'event' ? 60 : 30);
      return {
        item,
        start,
        end,
        title: `${entryEmoji(e)} ${e.title}${e.shared ? ' 👥' : ''}`,
        label: `${item.time}${e.endTime ? `–${e.endTime}` : ''}`,
        done: item.done,
        tone: item.area?.color ?? (e.category ? CATEGORY_TONE[e.category] : undefined),
      };
    }
    case 'plan':
      return { item, start, end: start + 60, title: `${item.area.emoji} ${item.item.title}`, label: item.time, done: item.done, tone: item.area.color };
    case 'google': {
      const g = item.event;
      const end = g.endTime && toMin(g.endTime) > start ? toMin(g.endTime) : start + 60;
      return { item, start, end, title: g.title, label: `${item.time}${g.endTime ? `–${g.endTime}` : ''}`, done: false, color: g.color };
    }
    default:
      return null;
  }
}

/** Reparte en columnas los bloques que se solapan. */
export function layoutBlocks(raw: Omit<Block, 'col' | 'cols'>[]): Block[] {
  const sorted = [...raw].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Block[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((b) => b.col + 1));
    for (const b of cluster) b.cols = cols;
    out.push(...cluster);
    cluster = [];
  };
  for (const r of sorted) {
    if (cluster.length && r.start >= clusterEnd) flush();
    const used = new Set(cluster.filter((b) => b.end > r.start).map((b) => b.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...r, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, r.end);
  }
  if (cluster.length) flush();
  return out;
}

function useNowMinutes(): number {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  return now.getHours() * 60 + now.getMinutes();
}

function openItem(item: AgendaItem) {
  if (item.kind === 'entry') openSheet({ type: 'entry', id: item.entry.id, date: item.date });
  else if (item.kind === 'plan') openSheet({ type: 'plan', id: item.item.id });
  else if (item.kind === 'google') openSheet({ type: 'google', event: item.event });
  else openSheet({ type: 'birthday', id: item.birthday.id });
}

/** «Día a vista»: lo de un día con sus horas, para ver de un vistazo qué toca. */
export function DayView({ date, today, onDateChange }: { date: string; today: string; onDateChange: (d: string) => void }) {
  const state = useApp();
  const now = useNowMinutes();
  const areas = useMemo(() => areaMap(state), [state]);
  const items = useMemo(() => agendaForDate(state, date, areas), [state, date, areas]);
  const diff = daysBetween(today, date);

  const allDay = items.filter((i) => i.kind === 'birthday' || (!i.time && (i.kind === 'google' || (i.kind === 'entry' && i.entry.kind === 'event'))));
  const todo = items.filter((i) => !i.time && ((i.kind === 'entry' && i.entry.kind !== 'event') || i.kind === 'plan'));
  const blocks = layoutBlocks(items.map(blockFor).filter((b): b is Omit<Block, 'col' | 'cols'> => !!b));
  const completables = items.filter((i) => (i.kind === 'entry' && i.entry.kind !== 'event') || i.kind === 'plan');
  const doneCount = completables.filter((i) => 'done' in i && i.done).length;

  let startH = 8;
  let endH = 21;
  for (const b of blocks) {
    startH = Math.min(startH, Math.floor(b.start / 60));
    endH = Math.max(endH, Math.ceil(b.end / 60));
  }
  if (diff === 0) {
    startH = Math.min(startH, Math.floor(now / 60));
    endH = Math.max(endH, Math.ceil(now / 60));
  }
  endH = Math.min(24, endH);
  const height = (endH - startH) * HOUR;

  const dayLabel = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : capitalize(formatLong(date).split(',')[0]);

  return (
    <div className="dayview">
      <div className="dv-nav">
        <button className="icon-btn small plain" aria-label="Día anterior" onClick={() => onDateChange(addDays(date, -1))}>
          <ChevronLeft size={20} />
        </button>
        <div className="seg grow" role="tablist">
          <button className={diff === 0 ? 'on' : ''} onClick={() => onDateChange(today)} role="tab" aria-selected={diff === 0}>
            Hoy
          </button>
          <button className={diff === 1 ? 'on' : ''} onClick={() => onDateChange(addDays(today, 1))} role="tab" aria-selected={diff === 1}>
            Mañana
          </button>
          {diff !== 0 && diff !== 1 && (
            <button className="on" role="tab" aria-selected>
              {dayLabel}
            </button>
          )}
        </div>
        <button className="icon-btn small plain" aria-label="Día siguiente" onClick={() => onDateChange(addDays(date, 1))}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="dv-head">
        <div>
          <div className="dv-date">{capitalize(formatLong(date))}</div>
          <div className="small muted">
            {items.length === 0
              ? 'Día libre'
              : [
                  blocks.length ? `${blocks.length} con hora` : '',
                  todo.length ? `${todo.length} para el día` : '',
                  allDay.length ? `${allDay.length} todo el día` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </div>
        </div>
        {completables.length > 0 && (
          <div className="dv-ring" aria-label={`${doneCount} de ${completables.length} hechas`} style={{ '--p': doneCount / completables.length } as CSSProperties}>
            <span>
              {doneCount}/{completables.length}
            </span>
          </div>
        )}
      </div>

      {allDay.length > 0 && (
        <div className="dv-allday">
          {allDay.map((i) => (
            <button key={i.key} className={`dv-chip ${i.kind === 'birthday' ? 'tone-pink' : i.kind === 'entry' && i.area ? `tone-${i.area.color}` : 'tone-primary'}`} onClick={() => openItem(i)}>
              {i.kind === 'birthday'
                ? `🎂 Cumple de ${i.birthday.name}${i.age ? ` (${i.age})` : ''}`
                : i.kind === 'google'
                  ? `📅 ${i.event.title}`
                  : i.kind === 'entry'
                    ? `${entryEmoji(i.entry)} ${i.entry.title}`
                    : ''}
            </button>
          ))}
        </div>
      )}

      {todo.length > 0 && (
        <div className="list mt12">
          {todo.map((i) => (
            <AgendaRow key={i.key} item={i} />
          ))}
        </div>
      )}

      {blocks.length > 0 || (diff === 0 && items.length > 0) ? (
        <div
          className="dv-grid mt12"
          style={{ height }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mins = startH * 60 + Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30;
            const time = makeHHMM(Math.floor(mins / 60), mins % 60) ?? undefined;
            openSheet({ type: 'quick', date, time });
          }}
          role="presentation"
        >
          {Array.from({ length: endH - startH + 1 }, (_, k) => (
            <div key={k} className="dv-hour" style={{ top: k * HOUR }}>
              <span>{String(startH + k).padStart(2, '0')}:00</span>
            </div>
          ))}
          {blocks.map((b) => {
            const top = ((b.start - startH * 60) / 60) * HOUR;
            const h = Math.max(30, ((b.end - b.start) / 60) * HOUR - 3);
            const style: CSSProperties = {
              top,
              height: h,
              left: `calc(${(b.col / b.cols) * 100}% + 4px)`,
              width: `calc(${100 / b.cols}% - 6px)`,
            };
            if (b.color) Object.assign(style, { '--tone': b.color, '--tone-soft': `color-mix(in srgb, ${b.color} 18%, var(--bg-elev))` });
            return (
              <button
                key={b.item.key}
                className={`dv-block ${b.tone ? `tone-${b.tone}` : b.color ? '' : 'tone-primary'} ${b.done ? 'done' : ''}`}
                style={style}
                onClick={(e) => {
                  e.stopPropagation();
                  openItem(b.item);
                }}
              >
                <span className="t">{b.title}</span>
                {h >= 44 && <span className="l">{b.label}</span>}
              </button>
            );
          })}
          {diff === 0 && now >= startH * 60 && now <= endH * 60 && (
            <div className="dv-now" style={{ top: ((now - startH * 60) / 60) * HOUR }} aria-label="Ahora" />
          )}
        </div>
      ) : null}

      {items.length === 0 && (
        <div className="card mt12">
          <Empty
            emoji={diff === 0 ? '🌤️' : '🗓️'}
            title={diff === 0 ? 'Nada apuntado para hoy' : `Nada apuntado para ${dayLabel.toLowerCase()}`}
            text={diff === 0 ? 'Toca una hora para añadir algo, o usa el botón +.' : undefined}
            action={
              <button className="btn small" onClick={() => openSheet({ type: 'quick', date })}>
                <Plus size={16} /> Añadir
              </button>
            }
          />
        </div>
      )}
      {(blocks.length > 0 || (diff === 0 && items.length > 0)) && <p className="hint center">Toca una hora libre para apuntar algo a esa hora.</p>}
    </div>
  );
}
