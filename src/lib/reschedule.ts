import type { Entry, HHMM, ISODate } from '../store/types';
import { addDays, daysBetween, formatShort, parseISODate, weekdayIndex, WEEKDAYS } from './dates';

/**
 * Qué cambia al pasar algo a otro día (o dejarlo sin día, en Pendientes). Se queda la hora, salvo si es
 * para hoy y ya ha pasado; lo de varios días conserva cuántos dura.
 */
export function reschedulePatch(e: Entry, to: ISODate | undefined, today: ISODate, now: HHMM): Partial<Entry> {
  if (!to) return { date: undefined, endDate: undefined, time: undefined, endTime: undefined, alert: null };
  const span = e.date && e.endDate ? daysBetween(e.date, e.endDate) : 0;
  const patch: Partial<Entry> = { date: to, endDate: span > 0 ? addDays(to, span) : undefined };
  if (e.time && to === today && e.time <= now) Object.assign(patch, { time: undefined, endTime: undefined, alert: null });
  return patch;
}

/** Para el aviso: «a hoy», «a mañana», «al sábado 31», «al jue 12 nov». */
export function movedTo(to: ISODate, today: ISODate): string {
  const diff = daysBetween(today, to);
  if (diff === 0) return 'a hoy';
  if (diff === 1) return 'a mañana';
  if (diff > 1 && diff < 7) return `al ${WEEKDAYS[weekdayIndex(to)]} ${parseISODate(to).getDate()}`;
  return `al ${formatShort(to)}${to.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${to.slice(0, 4)}`}`;
}
