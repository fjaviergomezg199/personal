import { addDays, ageOn, daysBetween, weekdayIndex } from '../lib/dates';
import { fold } from '../lib/quickParse';
import { isDoneOn, nextBirthday, occursOn } from '../lib/recurrence';
import type { AppState, Area, Birthday, Entry, GoogleCalendarInfo, GoogleEvent, HHMM, ISODate, PlanItem } from './types';

export type AgendaItem =
  | { kind: 'entry'; key: string; date: ISODate; time?: HHMM; entry: Entry; area?: Area; done: boolean }
  | { kind: 'plan'; key: string; date: ISODate; time?: HHMM; item: PlanItem; area: Area; done: boolean }
  | { kind: 'birthday'; key: string; date: ISODate; time?: undefined; birthday: Birthday; age?: number }
  | { kind: 'google'; key: string; date: ISODate; time?: HHMM; event: GoogleEvent; calendar?: GoogleCalendarInfo };

function rank(i: AgendaItem): number {
  if (i.kind === 'birthday') return 0;
  if (i.time) return 2;
  if (i.kind === 'google' || (i.kind === 'entry' && i.entry.kind === 'event')) return 1;
  return 3;
}

export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
    return 0;
  });
}

export function areaMap(s: AppState): Map<string, Area> {
  return new Map(s.areas.map((a) => [a.id, a]));
}

export function agendaForDate(s: AppState, date: ISODate, areas = areaMap(s)): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const b of s.birthdays) {
    const next = nextBirthday(b, date);
    if (next === date) out.push({ kind: 'birthday', key: `b:${b.id}`, date, birthday: b, age: ageOn(b.year, date) });
  }
  for (const e of s.entries) {
    if (!e.date || !occursOn(e, date)) continue;
    const area = e.areaId ? areas.get(e.areaId) : undefined;
    if (area && !area.showOnToday && e.kind === 'task') continue;
    const multiDayMiddle = e.repeat === 'none' && e.date !== date;
    out.push({
      kind: 'entry', key: `e:${e.id}:${date}`, date, time: multiDayMiddle ? undefined : e.time, entry: e, area, done: isDoneOn(e, date),
    });
  }
  for (const p of s.plan) {
    if (p.date !== date) continue;
    const area = areas.get(p.areaId);
    if (!area || !area.showOnToday) continue;
    out.push({ kind: 'plan', key: `p:${p.id}`, date, time: p.time, item: p, area, done: !!p.done });
  }
  const readable = new Set(s.settings.google.readCalendarIds);
  const cals = new Map(s.googleCalendars.map((c) => [c.id, c]));
  for (const g of s.googleEvents) {
    if (!readable.has(g.calendarId) && !(g.calendarId === 'primary' && readable.size === 0)) continue;
    const inRange = g.endDate && g.endDate > g.date ? date >= g.date && date <= g.endDate : g.date === date;
    if (!inRange) continue;
    out.push({ kind: 'google', key: `g:${g.calendarId}:${g.id}:${date}`, date, time: g.date === date ? g.time : undefined, event: g, calendar: cals.get(g.calendarId) });
  }
  return sortAgenda(out);
}

/** Recordatorios y tareas con fecha pasada sin hacer. */
export function overdueEntries(s: AppState, today: ISODate): Entry[] {
  return s.entries
    .filter((e) => e.kind !== 'event' && e.repeat === 'none' && !e.done && e.date && e.date < today)
    .sort((a, b) => (a.date! + (a.time ?? '')).localeCompare(b.date! + (b.time ?? '')));
}

/** Tareas sin fecha que no son de ningún área. */
export function inboxTasks(s: AppState): Entry[] {
  return s.entries.filter((e) => e.kind === 'task' && !e.date && !e.areaId && !e.done);
}

export function areaTasks(s: AppState, areaId: string): Entry[] {
  return s.entries.filter((e) => e.areaId === areaId && e.kind !== 'event');
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

/** Próximos días con cosas (para la vista de lista). */
export function upcomingAgenda(s: AppState, from: ISODate, days: number): { date: ISODate; items: AgendaItem[] }[] {
  const areas = areaMap(s);
  const out: { date: ISODate; items: AgendaItem[] }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const items = agendaForDate(s, date, areas);
    if (items.length) out.push({ date, items });
  }
  return out;
}

export function planForWeek(s: AppState, areaId: string, anyDate: ISODate): PlanItem[] {
  const start = addDays(anyDate, -weekdayIndex(anyDate));
  const end = addDays(start, 6);
  return s.plan.filter((p) => p.areaId === areaId && p.date >= start && p.date <= end);
}

export function todaysMenu(area: Area, date: ISODate): { meal: string; text: string }[] {
  const day = area.menu?.days[weekdayIndex(date)] ?? {};
  const meals = area.menu?.meals ?? [];
  const ordered = [...meals, ...Object.keys(day).filter((m) => !meals.includes(m))];
  return ordered.filter((m) => day[m]).map((m) => ({ meal: m, text: day[m] }));
}

export function sortedAreas(s: AppState): Area[] {
  return [...s.areas].sort((a, b) => a.order - b.order);
}

/** El nombre de la otra persona del hogar compartido (por lo último que ha apuntado). */
export function partnerName(s: AppState): string | undefined {
  const mine = fold(s.settings.name.trim());
  let best: { name: string; t: number } | undefined;
  const see = (by: string | undefined, t: number) => {
    const name = by?.trim();
    if (!name || fold(name) === mine) return;
    if (!best || t > best.t) best = { name, t };
  };
  for (const i of s.listItems) see(i.by, i.updatedAt);
  for (const m of s.finance.movements) if (m.scope === 'hogar') see(m.by, m.updatedAt);
  for (const f of s.finance.recurring) if (f.scope === 'hogar') see(f.by, f.updatedAt);
  for (const e of s.entries) if (e.shared) see(e.by, Date.parse(e.updatedAt) || 0);
  return best?.name;
}
