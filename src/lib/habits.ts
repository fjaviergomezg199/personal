import type { Habit, ISODate } from '../store/types';
import { addDays, localDay, weekdayIndex } from './dates';

/** ¿Toca ese día? */
export const scheduled = (h: Habit, date: ISODate) => !h.days.length || h.days.includes(weekdayIndex(date));

export const countOn = (log: Record<ISODate, number> | undefined, date: ISODate) => log?.[date] ?? 0;

export const doneOn = (h: Habit, log: Record<ISODate, number> | undefined, date: ISODate) => countOn(log, date) >= h.target;

/**
 * Racha: días seguidos (de los que toca) cumplidos hasta hoy. Si hoy aún no está
 * hecho, no la rompe: cuenta desde ayer.
 */
export function streak(h: Habit, log: Record<ISODate, number> | undefined, today: ISODate): number {
  let n = 0;
  let d = today;
  if (scheduled(h, d) && !doneOn(h, log, d)) d = addDays(d, -1);
  const created = localDay(h.createdAt);
  for (let k = 0; k < 3660; k++, d = addDays(d, -1)) {
    if (!scheduled(h, d)) {
      if (d < created) break;
      continue;
    }
    if (!doneOn(h, log, d)) break;
    n++;
  }
  return n;
}

/** La mejor racha que ha habido. */
export function bestStreak(h: Habit, log: Record<ISODate, number> | undefined, today: ISODate): number {
  const dates = Object.keys(log ?? {}).sort();
  if (!dates.length) return 0;
  let best = 0;
  let run = 0;
  for (let d = dates[0]; d <= today; d = addDays(d, 1)) {
    if (!scheduled(h, d)) continue;
    if (doneOn(h, log, d)) best = Math.max(best, ++run);
    else if (d < today) run = 0;
  }
  return best;
}

/** Parte de los días que tocaba (desde `from`) en que se cumplió. */
export function completion(h: Habit, log: Record<ISODate, number> | undefined, from: ISODate, to: ISODate): { done: number; due: number } {
  let done = 0;
  let due = 0;
  const created = localDay(h.createdAt);
  const start = created > from ? created : from;
  for (let d = start; d <= to; d = addDays(d, 1)) {
    if (!scheduled(h, d)) continue;
    due++;
    if (doneOn(h, log, d)) done++;
  }
  return { done, due };
}

/** «Todos los días», «L, X y V», «Fines de semana»… */
export function daysLabel(days: number[]): string {
  const names = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const d = [...days].sort();
  if (!d.length || d.length === 7) return 'Todos los días';
  if (d.join() === '0,1,2,3,4') return 'De lunes a viernes';
  if (d.join() === '5,6') return 'Fines de semana';
  const list = d.map((i) => names[i]);
  return list.length === 1 ? `Los ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'][d[0]]}` : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}
