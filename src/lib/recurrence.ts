import type { Birthday, Entry, ISODate } from '../store/types';
import { addDays, daysBetween, makeISODate, parseISODate, weekdayIndex } from './dates';

type Schedulable = Pick<Entry, 'date' | 'endDate' | 'repeat' | 'repeatUntil'>;

export function occursOn(e: Schedulable, iso: ISODate): boolean {
  if (!e.date) return false;
  if (iso < e.date) return false;
  if (e.repeat === 'none') {
    if (e.endDate && e.endDate > e.date) return iso <= e.endDate;
    return iso === e.date;
  }
  if (e.repeatUntil && iso > e.repeatUntil) return false;
  switch (e.repeat) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekdayIndex(iso) < 5;
    case 'weekly':
      return weekdayIndex(iso) === weekdayIndex(e.date);
    case 'monthly':
      return iso.slice(8) === e.date.slice(8);
    case 'yearly':
      return iso.slice(5) === e.date.slice(5);
    default:
      return false;
  }
}

/** Primera ocurrencia en o después de `from` (busca hasta ~4 años). */
export function nextOccurrence(e: Schedulable, from: ISODate): ISODate | null {
  if (!e.date) return null;
  if (e.repeat === 'none') {
    const last = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    if (last < from) return null;
    return e.date >= from ? e.date : from;
  }
  let d = e.date > from ? e.date : from;
  const limit = e.repeat === 'yearly' ? 366 * 4 + 1 : 400;
  for (let i = 0; i < limit; i++) {
    if (e.repeatUntil && d > e.repeatUntil) return null;
    if (occursOn(e, d)) return d;
    d = addDays(d, 1);
  }
  return null;
}

export function occurrencesBetween(e: Schedulable, from: ISODate, to: ISODate): ISODate[] {
  if (!e.date) return [];
  const out: ISODate[] = [];
  let d = e.date > from ? e.date : from;
  const n = daysBetween(d, to);
  for (let i = 0; i <= n; i++) {
    if (occursOn(e, d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function isDoneOn(e: Pick<Entry, 'repeat' | 'done' | 'doneDates'>, iso: ISODate): boolean {
  if (e.repeat === 'none') return !!e.done;
  return !!e.doneDates?.includes(iso);
}

/** Fecha del cumpleaños en un año dado (29-F → 28-F en años no bisiestos). */
export function birthdayInYear(b: Pick<Birthday, 'day' | 'month'>, year: number): ISODate {
  return makeISODate(year, b.month, b.day) ?? makeISODate(year, b.month, b.day - 1) ?? `${year}-02-28`;
}

export function nextBirthday(b: Pick<Birthday, 'day' | 'month'>, from: ISODate): ISODate {
  const year = parseISODate(from).getFullYear();
  const thisYear = birthdayInYear(b, year);
  return thisYear >= from ? thisYear : birthdayInYear(b, year + 1);
}

export function birthdayOn(b: Pick<Birthday, 'day' | 'month'>, iso: ISODate): boolean {
  return birthdayInYear(b, Number(iso.slice(0, 4))) === iso;
}

export const REPEAT_LABELS: Record<Entry['repeat'], string> = {
  none: 'No se repite',
  daily: 'Cada día',
  weekdays: 'De lunes a viernes',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  yearly: 'Cada año',
};
