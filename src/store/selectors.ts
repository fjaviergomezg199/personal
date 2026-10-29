import { addDays, ageOn, daysBetween } from '../lib/dates';
import { birthdayOn, isDoneOn, nextBirthday, occurrencesBetween } from '../lib/recurrence';
import type { AppState, Birthday, Category, Entry, GoogleCalendarInfo, GoogleEvent, HHMM, ID, ISODate } from './types';

export type AgendaItem =
  | { kind: 'entry'; key: string; date: ISODate; time?: HHMM; entry: Entry; category?: Category; done: boolean }
  | { kind: 'birthday'; key: string; date: ISODate; time?: undefined; birthday: Birthday; age?: number }
  | { kind: 'google'; key: string; date: ISODate; time?: HHMM; event: GoogleEvent; calendar?: GoogleCalendarInfo };

/** El primer y el último día de lo que dura varios días (un viaje, un finde…); si no, null. */
export function spanOf(i: AgendaItem): { start: ISODate; end: ISODate } | null {
  if (i.kind === 'entry') {
    const e = i.entry;
    return e.repeat === 'none' && e.date && e.endDate && e.endDate > e.date ? { start: e.date, end: e.endDate } : null;
  }
  if (i.kind === 'google') return i.event.endDate && i.event.endDate > i.event.date ? { start: i.event.date, end: i.event.endDate } : null;
  return null;
}

export const isMultiDay = (i: AgendaItem) => spanOf(i) !== null;

function rank(i: AgendaItem): number {
  if (isMultiDay(i)) return -1;
  if (i.kind === 'birthday') return 0;
  if (i.time) return 2;
  if (i.kind === 'google' || (i.kind === 'entry' && i.entry.kind === 'event')) return 1;
  return 3;
}

/** Primero lo de varios días, luego lo de todo el día (cumpleaños, planes), por hora y al final las tareas sin hora. */
export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
    return 0;
  });
}

export function sortedCategories(s: AppState): Category[] {
  return [...s.categories].sort((a, b) => a.order - b.order);
}

export function categoryMap(s: AppState): Map<ID, Category> {
  return new Map(s.categories.map((c) => [c.id, c]));
}

export interface AgendaOptions {
  /** Sin las categorías ocultas (el filtro del calendario). */
  hideHidden?: boolean;
}

/** Lo que hay cada día entre `from` y `to` (incluidos), recorriendo los datos una sola vez. */
export function agendaForRange(s: AppState, from: ISODate, to: ISODate, opts: AgendaOptions = {}): Map<ISODate, AgendaItem[]> {
  const days = daysBetween(from, to);
  const out = new Map<ISODate, AgendaItem[]>();
  for (let i = 0; i <= days; i++) out.set(addDays(from, i), []);
  const push = (item: AgendaItem) => out.get(item.date)?.push(item);
  const cats = categoryMap(s);
  const hidden = new Set(opts.hideHidden ? (s.settings.hiddenCategories ?? []) : []);

  for (const b of s.birthdays) {
    // Un año por cada año que toque el rango
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      const date = nextBirthday(b, `${y}-01-01`);
      if (date >= from && date <= to && birthdayOn(b, date)) push({ kind: 'birthday', key: `b:${b.id}:${date}`, date, birthday: b, age: ageOn(b.year, date) });
    }
  }
  for (const e of s.entries) {
    if (!e.date || e.date > to) continue;
    if (e.categoryId && hidden.has(e.categoryId)) continue;
    const category = e.categoryId ? cats.get(e.categoryId) : undefined;
    for (const date of occurrencesBetween(e, from, to)) {
      // En los días de en medio de un plan de varios días no se repite la hora
      const middle = e.repeat === 'none' && e.date !== date;
      push({ kind: 'entry', key: `e:${e.id}:${date}`, date, time: middle ? undefined : e.time, entry: e, category, done: isDoneOn(e, date) });
    }
  }
  const readable = new Set(s.settings.google.readCalendarIds);
  const calendars = new Map(s.googleCalendars.map((c) => [c.id, c]));
  for (const g of s.googleEvents) {
    if (!readable.has(g.calendarId) && !(g.calendarId === 'primary' && readable.size === 0)) continue;
    const last = g.endDate && g.endDate > g.date ? g.endDate : g.date;
    if (last < from || g.date > to) continue;
    for (let d = g.date < from ? from : g.date; d <= last && d <= to; d = addDays(d, 1)) {
      push({ kind: 'google', key: `g:${g.calendarId}:${g.id}:${d}`, date: d, time: d === g.date ? g.time : undefined, event: g, calendar: calendars.get(g.calendarId) });
    }
  }
  for (const [d, items] of out) out.set(d, sortAgenda(items));
  return out;
}

export function agendaForDate(s: AppState, date: ISODate, opts: AgendaOptions = {}): AgendaItem[] {
  return agendaForRange(s, date, date, opts).get(date) ?? [];
}

/** Recordatorios y tareas de días pasados sin hacer. */
export function overdueEntries(s: AppState, today: ISODate): Entry[] {
  // Lo de un plan importado (entrenos, temas…) no se arrastra: si no se hizo, se queda en su día
  return s.entries
    .filter((e) => e.kind !== 'event' && e.repeat === 'none' && !e.done && !e.importId && e.date && (e.endDate ?? e.date) < today)
    .sort((a, b) => (a.date! + (a.time ?? '')).localeCompare(b.date! + (b.time ?? '')));
}

/** Tareas sin fecha. */
export function undatedTasks(s: AppState): Entry[] {
  return s.entries.filter((e) => e.kind === 'task' && !e.date && !e.done);
}

/**
 * 📌 Pendientes: lo que se quedó sin hacer de otros días y lo apuntado sin fecha, a la vista hasta que se
 * haga. Arriba lo importante y, luego, lo último que ha quedado pendiente.
 */
export function pendingEntries(s: AppState, today: ISODate): Entry[] {
  const since = (e: Entry) => (e.date ? (e.endDate ?? e.date) : e.createdAt.slice(0, 10));
  return [...overdueEntries(s, today), ...undatedTasks(s)].sort(
    (a, b) => Number(!!b.important) - Number(!!a.important) || since(b).localeCompare(since(a)) || b.createdAt.localeCompare(a.createdAt),
  );
}

export interface UpcomingBirthday {
  birthday: Birthday;
  date: ISODate;
  inDays: number;
  age?: number;
}

export function upcomingBirthdays(s: AppState, from: ISODate, days = 366): UpcomingBirthday[] {
  return s.birthdays
    .map((b) => {
      const date = nextBirthday(b, from);
      return { birthday: b, date, inDays: daysBetween(from, date), age: ageOn(b.year, date) };
    })
    .filter((x) => x.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays || a.birthday.name.localeCompare(b.birthday.name));
}

/** El título que se ve de cualquier cosa del calendario. */
export function itemTitle(i: AgendaItem): string {
  return i.kind === 'entry' ? i.entry.title : i.kind === 'google' ? i.event.title : `Cumpleaños de ${i.birthday.name}`;
}
