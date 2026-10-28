import type { AgendaItem } from '../store/selectors';
import type { HHMM, ISODate } from '../store/types';
import { addDays, addMonths, startOfWeek } from './dates';

/** Las semanas (de lunes a domingo) que ocupa un mes en la cuadrícula. */
export function monthGrid(anyDay: ISODate): ISODate[][] {
  const first = `${anyDay.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const weeks: ISODate[][] = [];
  for (let d = startOfWeek(first); d <= last; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

/** Los 7 días de la semana de ese día. */
export function weekDays(anyDay: ISODate): ISODate[] {
  const start = startOfWeek(anyDay);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const toMinutes = (t: HHMM) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export interface Block {
  item: AgendaItem;
  /** Minutos desde las 00:00. */
  start: number;
  end: number;
  /** Columna dentro del día y cuántas hay a la vez (para lo que se solapa). */
  lane: number;
  lanes: number;
}

/** Cuánto dura algo con hora (sin hora de fin: los planes 1 h y lo demás 30 min). */
function span(i: AgendaItem): [number, number] | null {
  if (!i.time) return null;
  const start = toMinutes(i.time);
  const endTime = i.kind === 'entry' ? i.entry.endTime : i.kind === 'google' ? i.event.endTime : undefined;
  const fallback = i.kind === 'entry' && i.entry.kind !== 'event' ? 30 : 60;
  const end = endTime && toMinutes(endTime) > start ? toMinutes(endTime) : Math.min(start + fallback, 24 * 60);
  return [start, Math.max(end, start + 20)];
}

/** Coloca lo que tiene hora en un día: lo que se solapa va en columnas, una al lado de otra. */
export function layoutDay(items: AgendaItem[]): Block[] {
  const blocks = items
    .map((item) => {
      const s = span(item);
      return s ? { item, start: s[0], end: s[1], lane: 0, lanes: 1 } : null;
    })
    .filter((b): b is Block => !!b)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  // Grupos de cosas que se tocan; dentro de cada grupo, la primera columna libre
  let group: Block[] = [];
  let groupEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...group.map((b) => b.lane + 1));
    for (const b of group) b.lanes = lanes;
    group = [];
  };
  for (const b of blocks) {
    if (b.start >= groupEnd) {
      close();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.end > b.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    b.lane = lane;
    group.push(b);
    groupEnd = Math.max(groupEnd, b.end);
  }
  close();
  return blocks;
}

/**
 * Desde qué minuto enseñar la parrilla por horas: que quepa lo que queda por
 * delante (desde las 7:00 si cabe) y, si entra hoy, la hora de ahora.
 * `span` son los minutos que caben en pantalla.
 */
export function firstVisibleMinute(days: { date: ISODate; blocks: Block[] }[], today: ISODate, now: number, span: number): number {
  const ahead = days.some((d) => d.date >= today);
  // Lo que ya pasó importa menos: de hoy, lo que acaba después de hace una hora
  let blocks = ahead ? days.flatMap((d) => (d.date > today ? d.blocks : d.date === today ? d.blocks.filter((b) => b.end > now - 60) : [])) : days.flatMap((d) => d.blocks);
  if (ahead && !blocks.length && !days.some((d) => d.date === today)) blocks = days.flatMap((d) => d.blocks);
  const starts = blocks.map((b) => b.start);
  const ends = blocks.map((b) => b.end);
  if (days.some((d) => d.date === today)) {
    starts.push(now - 60);
    ends.push(now + 60);
  }
  const DEFAULT = 7 * 60;
  if (!starts.length) return DEFAULT;
  const first = Math.min(...starts);
  const last = Math.max(...ends);
  return Math.max(0, Math.min(first, Math.max(DEFAULT, last - span)));
}

/** La media hora en la que se ha tocado (para crear algo a esa hora). */
export function slotAt(offsetY: number, hourPx: number): HHMM {
  const minutes = Math.max(0, Math.min(23 * 60 + 30, Math.floor(offsetY / hourPx / 0.5) * 30));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
