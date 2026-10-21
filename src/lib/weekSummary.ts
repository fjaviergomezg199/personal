import { agendaForDate, areaMap, type AgendaItem } from '../store/selectors';
import type { AppState, Area, FinScope, Goal, Habit, ISODate } from '../store/types';
import { addDays, startOfWeek, toISODate, weekdayIndex, weekKey } from './dates';
import { categoryOf, summarize } from './finance';
import { countOn, scheduled } from './habits';
import { occursOn } from './recurrence';

/*
 * Resumen de una semana (de lunes a domingo): lo hecho, los planes, entrenos,
 * hábitos, gastos, peso, calorías, objetivos y lo que viene después.
 */

export type DayMark = 'done' | 'part' | 'miss' | 'off' | 'future';

export interface WeekSummary {
  start: ISODate;
  end: ISODate;
  /** Último día que cuenta (hoy, si la semana no ha terminado). */
  until: ISODate;
  done: { key: string; title: string; date: ISODate }[];
  plans: { key: string; title: string; date: ISODate; shared?: boolean }[];
  sessions: { area: Area; done: number; total: number }[];
  habits: { habit: Habit; days: DayMark[]; done: number; due: number }[];
  money: { scope: FinScope; spent: number; prev: number; top: { key: string; amount: number }[] }[];
  weight?: { name: string; value: number; delta?: number; unit: string; decimals: number };
  kcal?: { avg: number; days: number; target?: number };
  goals: { goal: Goal; value: number }[];
  bought: number;
  next: AgendaItem[];
}

/** La semana que toca resumir en Hoy: el domingo, la que acaba; el lunes, la que acabó. */
export function summaryWeekFor(today: ISODate): ISODate | null {
  const wd = weekdayIndex(today);
  if (wd === 6) return startOfWeek(today);
  if (wd === 0) return addDays(today, -7);
  return null;
}

const localDay = (iso: string) => toISODate(new Date(iso));
const msDay = (ms: number) => toISODate(new Date(ms));

export function weekSummary(s: AppState, start: ISODate, today: ISODate): WeekSummary {
  const end = addDays(start, 6);
  const until = end < today ? end : today;
  const inWeek = (d: ISODate | undefined) => !!d && d >= start && d <= end;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const me = s.settings.name.trim().toLowerCase();

  // Lo hecho: tareas y recordatorios (los repetidos, cada día), y las tareas de casa propias
  const done: WeekSummary['done'] = [];
  for (const e of s.entries) {
    if (e.kind === 'event') continue;
    if (e.repeat !== 'none') {
      for (const d of e.doneDates ?? []) if (inWeek(d)) done.push({ key: `${e.id}:${d}`, title: e.title, date: d });
    } else if (e.done) {
      const d = localDay(e.doneAt ?? e.updatedAt);
      if (inWeek(d)) done.push({ key: e.id, title: e.title, date: d });
    }
  }
  for (const i of s.listItems) {
    if (i.list !== 'casa' || !i.done || i.deleted || (i.by && i.by.trim().toLowerCase() !== me)) continue;
    const d = msDay(i.updatedAt);
    if (inWeek(d)) done.push({ key: i.id, title: i.text, date: d });
  }
  done.sort((a, b) => a.date.localeCompare(b.date));

  // Planes que ha habido
  const plans: WeekSummary['plans'] = [];
  for (const e of s.entries) {
    if (e.kind !== 'event' || !e.date) continue;
    const d = days.find((x) => x <= until && occursOn(e, x));
    if (d) plans.push({ key: e.id, title: e.title, date: d, shared: e.shared });
  }
  plans.sort((a, b) => a.date.localeCompare(b.date));

  // Entrenos y sesiones de cada área
  const areas = areaMap(s);
  const byArea = new Map<string, { area: Area; done: number; total: number }>();
  for (const p of s.plan) {
    const area = areas.get(p.areaId);
    if (!area || !inWeek(p.date)) continue;
    const cur = byArea.get(area.id) ?? { area, done: 0, total: 0 };
    cur.total++;
    if (p.done) cur.done++;
    byArea.set(area.id, cur);
  }
  const sessions = [...byArea.values()].sort((a, b) => a.area.order - b.area.order);

  // Hábitos, día a día
  const habits = s.habits
    .filter((h) => !h.archived && h.createdAt.slice(0, 10) <= end)
    .sort((a, b) => a.order - b.order)
    .map((h) => {
      const log = s.habitLog[h.id];
      const created = h.createdAt.slice(0, 10);
      let doneN = 0;
      let due = 0;
      const marks = days.map((d): DayMark => {
        if (d > until) return 'future';
        if (!scheduled(h, d) || d < created) return 'off';
        due++;
        const n = countOn(log, d);
        if (n >= h.target) {
          doneN++;
          return 'done';
        }
        return n > 0 ? 'part' : 'miss';
      });
      return { habit: h, days: marks, done: doneN, due };
    });

  // Dinero: lo gastado (con los fijos cargados) frente a la semana anterior
  const money: WeekSummary['money'] = [];
  const scopes: FinScope[] = ['personal', 'hogar'];
  for (const scope of scopes) {
    const has = s.finance.movements.some((m) => m.scope === scope && !m.deleted) || s.finance.recurring.some((r) => r.scope === scope && !r.deleted);
    if (!has) continue;
    const cur = summarize(s.finance, scope, start, end, today, until);
    const prev = summarize(s.finance, scope, addDays(start, -7), addDays(start, -1), today);
    if (!cur.spent && !prev.spent) continue;
    // Categorías que ya no existen van juntas a «Otros»
    const byCat = new Map<string, number>();
    for (const c of cur.byCategory) {
      const k = categoryOf(c.key).key;
      byCat.set(k, Math.round(((byCat.get(k) ?? 0) + c.amount) * 100) / 100);
    }
    const top = [...byCat].map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount).slice(0, 3);
    money.push({ scope, spent: cur.spent, prev: prev.spent, top });
  }

  // Peso (o la primera medida que se apunte)
  let weight: WeekSummary['weight'];
  const type = s.metricTypes.find((m) => m.id === 'peso') ?? s.metricTypes[0];
  if (type) {
    const series = s.metrics.filter((m) => m.metricId === type.id).sort((a, b) => a.date.localeCompare(b.date));
    const week = series.filter((m) => inWeek(m.date));
    const before = series.filter((m) => m.date < start).at(-1);
    const last = week.at(-1);
    if (last) {
      const ref = before ?? (week.length > 1 ? week[0] : undefined);
      weight = { name: type.name, value: last.value, delta: ref ? last.value - ref.value : undefined, unit: type.unit, decimals: type.decimals };
    }
  }

  // Calorías: media de los días apuntados
  let kcal: WeekSummary['kcal'];
  const perDay = new Map<ISODate, number>();
  for (const f of s.foodLog) if (inWeek(f.date) && f.date <= until) perDay.set(f.date, (perDay.get(f.date) ?? 0) + f.kcal);
  if (perDay.size) kcal = { avg: Math.round([...perDay.values()].reduce((a, b) => a + b, 0) / perDay.size), days: perDay.size, target: s.nutritionTargets.kcal };

  const wk = weekKey(start);
  const goals = s.goals.filter((g) => !g.archived && g.period === 'week' && g.createdAt.slice(0, 10) <= end).map((goal) => ({ goal, value: goal.progress[wk] ?? 0 }));

  const bought = s.listItems.filter((i) => i.list === 'compra' && i.done && !i.deleted && inWeek(msDay(i.updatedAt))).length;

  // La semana siguiente: planes, eventos y cumpleaños (lo repetido, una vez)
  const next: AgendaItem[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= 7; i++) {
    const d = addDays(end, i);
    for (const item of agendaForDate(s, d, areas)) {
      const wanted = item.kind === 'birthday' || item.kind === 'google' || (item.kind === 'entry' && item.entry.kind === 'event');
      const id = item.kind === 'entry' ? item.entry.id : item.key;
      if (!wanted || seen.has(id)) continue;
      seen.add(id);
      next.push(item);
    }
  }

  return { start, end, until, done, plans, sessions, habits, money, weight, kcal, goals, bought, next };
}

/** ¿Hay algo que contar? */
export function hasContent(w: WeekSummary): boolean {
  return !!(w.done.length || w.plans.length || w.sessions.length || w.habits.some((h) => h.due) || w.money.length || w.weight || w.kcal || w.goals.length || w.bought);
}

/** Parte de los hábitos cumplida (0–1), o null si no tocaba ninguno. */
export function habitRate(w: WeekSummary): number | null {
  const due = w.habits.reduce((n, h) => n + h.due, 0);
  return due ? w.habits.reduce((n, h) => n + h.done, 0) / due : null;
}
