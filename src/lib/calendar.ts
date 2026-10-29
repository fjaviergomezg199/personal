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
