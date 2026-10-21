import type { ISODate, MetricEntry } from '../store/types';
import { addDays, addMonths, daysBetween, MONTHS_SHORT, parseISODate, weekdayIndex } from './dates';

export type RangeKey = '1M' | '3M' | '6M' | '1A' | 'todo';

export const RANGES: { value: RangeKey; label: string }[] = [
  { value: '1M', label: '1 mes' },
  { value: '3M', label: '3 meses' },
  { value: '6M', label: '6 meses' },
  { value: '1A', label: '1 año' },
  { value: 'todo', label: 'Todo' },
];

/** Primer día incluido en el periodo (undefined = todo). */
export function rangeStart(range: RangeKey, today: ISODate): ISODate | undefined {
  switch (range) {
    case '1M':
      return addMonths(today, -1);
    case '3M':
      return addMonths(today, -3);
    case '6M':
      return addMonths(today, -6);
    case '1A':
      return addMonths(today, -12);
    default:
      return undefined;
  }
}

/** Medidas de un tipo, de la más antigua a la más reciente. */
export function seriesFor(all: MetricEntry[], metricId: string, from?: ISODate): MetricEntry[] {
  return all.filter((e) => e.metricId === metricId && (!from || e.date >= from)).sort((a, b) => a.date.localeCompare(b.date));
}

/** Hacia dónde hay que ir para llegar al objetivo: -1 bajar, 1 subir, 0 sin objetivo. */
export function goalDirection(goal: number | undefined, start: number | undefined): -1 | 0 | 1 {
  if (goal === undefined || start === undefined || goal === start) return 0;
  return goal < start ? -1 : 1;
}

export interface Change {
  delta: number;
  from: ISODate;
  days: number;
  /** Cambio medio por semana (solo si hay al menos dos semanas). */
  perWeek?: number;
}

export function changeOver(points: MetricEntry[]): Change | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const days = daysBetween(first.date, last.date);
  return { delta: last.value - first.value, from: first.date, days, perWeek: days >= 14 ? ((last.value - first.value) / days) * 7 : undefined };
}

/** Parte del camino hecho hacia el objetivo (0–1), desde la primera medida. */
export function goalProgress(start: number, current: number, goal: number): number {
  if (start === goal) return current === goal ? 1 : 0;
  return Math.max(0, Math.min(1, (start - current) / (start - goal)));
}

/** Eje con números redondos: 72 / 72,5 / 73… */
export function niceScale(min: number, max: number, count = 4): { lo: number; hi: number; step: number; ticks: number[]; decimals: number } {
  if (!(max > min)) {
    const pad = Math.max(1, Math.abs(min) * 0.02);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  let decimals = 0;
  while (decimals < 4 && Math.abs(Math.round(step * 10 ** decimals) - step * 10 ** decimals) > 1e-6) decimals++;
  const round = (v: number) => Number(v.toFixed(decimals));
  const lo = round(Math.floor(min / step + 1e-9) * step);
  const hi = round(Math.ceil(max / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round(v));
  return { lo, hi, step, ticks, decimals };
}

const dayNumber = (iso: ISODate) => Math.round(parseISODate(iso).getTime() / 86400000);

/** Fechas «redondas» para el eje horizontal (días, lunes, o primeros de mes), como mucho `max`. */
export function dateTicks(start: ISODate, end: ISODate, max = 4): ISODate[] {
  const span = daysBetween(start, end);
  if (span < 0) return [];
  const days: ISODate[] = [];
  for (let i = 0; i <= span; i++) days.push(addDays(start, i));
  for (const step of [1, 2, 3]) {
    const t = days.filter((d) => dayNumber(d) % step === 0);
    if (t.length <= max) return t;
  }
  for (const weeks of [1, 2]) {
    const t = days.filter((d) => weekdayIndex(d) === 0 && Math.round((dayNumber(d) - 4) / 7) % weeks === 0);
    if (t.length <= max && t.length >= 2) return t;
  }
  const firsts = days.filter((d) => d.endsWith('-01'));
  for (const step of [1, 2, 3, 6, 12]) {
    const t = firsts.filter((d) => (Number(d.slice(5, 7)) - 1) % step === 0);
    if (t.length <= max) return t;
  }
  const years = firsts.filter((d) => d.slice(5, 7) === '01');
  const every = Math.ceil(years.length / max);
  return years.filter((_, i) => i % every === 0);
}

/** «21 oct» para ticks de días; «oct» (o «oct 26» si hay varios años) para ticks de meses. */
export function dateTickLabel(iso: ISODate, ticks: ISODate[], start: ISODate, end: ISODate): string {
  const d = parseISODate(iso);
  const monthly = ticks.length > 1 && ticks.every((t) => t.endsWith('-01')) && daysBetween(ticks[0], ticks[1]) >= 28;
  if (!monthly) return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  const multiYear = start.slice(0, 4) !== end.slice(0, 4);
  return multiYear ? `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : MONTHS_SHORT[d.getMonth()];
}
