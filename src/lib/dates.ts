import type { HHMM, ISODate } from '../store/types';

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** 0 = lunes. */
export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const WEEKDAYS_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

export function makeISODate(year: number, month: number, day: number): ISODate | null {
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toISODate(d);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const d = parseISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** 0 = lunes ... 6 = domingo. */
export function weekdayIndex(iso: ISODate): number {
  return (parseISODate(iso).getDay() + 6) % 7;
}

export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, -weekdayIndex(iso));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = parseISODate(from);
  const b = parseISODate(to);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function combine(iso: ISODate, time?: HHMM): Date {
  const d = parseISODate(iso);
  if (time) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

export function toHHMM(d: Date): HHMM {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function makeHHMM(h: number, m = 0): HHMM | null {
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

export function addMinutesToTime(time: HHMM, minutes: number): HHMM {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Semana ISO: '2026-W43'. */
export function weekKey(iso: ISODate): string {
  const d = parseISODate(iso);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${thursday.getFullYear()}-W${pad(week)}`;
}

/** «19 – 25 oct», «28 sep – 4 oct» (semana que empieza en `start`). */
export function formatWeek(start: ISODate): string {
  const s = parseISODate(start);
  const e = parseISODate(addDays(start, 6));
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`
    : `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`;
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "miércoles, 21 de octubre" */
export function formatLong(iso: ISODate, withYear = false): string {
  const d = parseISODate(iso);
  const base = `${WEEKDAYS[weekdayIndex(iso)]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  return withYear ? `${base} de ${d.getFullYear()}` : base;
}

/** "mié 21 oct" */
export function formatShort(iso: ISODate): string {
  const d = parseISODate(iso);
  return `${WEEKDAYS_SHORT[weekdayIndex(iso)]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "21 oct" (o "21 oct 2027" si no es este año) */
export function formatDayMonth(iso: ISODate, today: ISODate = todayISO()): string {
  const d = parseISODate(iso);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** "Hoy", "Mañana", "Ayer", "El viernes", "mié 28 oct" */
export function formatRelative(iso: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff === 2) return 'Pasado mañana';
  if (diff > 1 && diff < 7) return cap(WEEKDAYS[weekdayIndex(iso)]);
  return cap(formatShort(iso)) + (iso.slice(0, 4) === today.slice(0, 4) ? '' : ` ${iso.slice(0, 4)}`);
}

export function formatAlert(minutes: number | null, allDay = false): string {
  if (minutes === null || minutes === undefined) return 'Sin aviso';
  if (allDay) {
    if (minutes === 900) return 'Día antes, 9:00';
    if (minutes === 240) return 'Día antes, 20:00';
    const at = new Date(2000, 0, 2);
    at.setMinutes(at.getMinutes() - minutes);
    const days = minutes / 1440;
    if (Number.isInteger(days)) return days === 1 ? '1 día antes' : `${days} días antes`;
    return `Antes, a las ${toHHMM(at)}`;
  }
  if (minutes === 0) return 'A la hora';
  if (minutes < 60) return `${minutes} min antes`;
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 día antes' : `${minutes / 1440} días antes`;
  if (minutes % 60 === 0) return minutes === 60 ? '1 hora antes' : `${minutes / 60} horas antes`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min antes`;
}

export const TIMED_ALERTS = [0, 5, 10, 15, 30, 60, 120, 1440];
export const ALLDAY_ALERTS = [900, 240];

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export function capitalize(s: string): string {
  return cap(s);
}

/** Edad que cumple en el año de `iso`. */
export function ageOn(year: number | undefined, iso: ISODate): number | undefined {
  if (!year) return undefined;
  const age = Number(iso.slice(0, 4)) - year;
  return age > 0 && age < 130 ? age : undefined;
}
