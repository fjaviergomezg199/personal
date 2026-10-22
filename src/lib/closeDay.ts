import { agendaForDate, areaMap, todaysMenu, type AgendaItem } from '../store/selectors';
import type { AppState, Habit, ISODate } from '../store/types';
import { addDays, localDay, toHHMM, toISODate } from './dates';
import { menuHasAlternatives, menuOptions } from './diary';
import { parseFoodText } from './foodParse';
import type { FoodRef } from './foods';
import { doneOn, scheduled, streak } from './habits';

/*
 * «Cerrar el día»: un minuto por la noche, todo con sí o no. Solo pregunta lo
 * que falta: hábitos sin marcar, comidas del menú sin apuntar y lo de hoy sin
 * hacer. Nada que escribir.
 */

export type CloseQuestion =
  | { kind: 'habit'; key: string; habit: Habit; text: string }
  /** Con varias opciones en el menú, se elige con un botón cada una. */
  | { kind: 'meal'; key: string; meal: string; menuText: string; options: string[]; text: string }
  /** `moveIfNo`: si no se hizo, pasa a mañana (lo de un solo día). */
  | { kind: 'task'; key: string; item: Extract<AgendaItem, { kind: 'entry' } | { kind: 'plan' }>; text: string; moveIfNo: boolean };

const MAX_MEALS = 4;
const MAX_TASKS = 6;
/** Que no pase de un minuto: como mucho 10 preguntas. */
const MAX_QUESTIONS = 10;
const EVENING = 20 * 60;
/** De madrugada (hasta las 4) lo que se cierra todavía es el día anterior. */
const LATE_UNTIL = 4 * 60;

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** ¿Está puesto el aviso de cada noche? (y sigue existiendo su recordatorio) */
export function closeDayReminderOn(s: AppState): boolean {
  const c = s.settings.closeDay;
  return !!c?.remind && s.entries.some((e) => e.id === c.entryId);
}

/** Desde qué hora sale la tarjeta en Hoy: las 20:00, o una hora antes del aviso si es por la tarde. */
export function closeDayFrom(s: AppState): number {
  if (!closeDayReminderOn(s)) return EVENING;
  const [h, m] = s.settings.closeDay!.time.split(':').map(Number);
  const at = h * 60 + m;
  return at >= 12 * 60 ? Math.min(EVENING, at - 60) : EVENING;
}

/** El día que la tarjeta de Hoy ofrece cerrar ahora, si toca: por la noche, hoy; de madrugada, ayer. */
export function closeDayCardDay(s: AppState, now: Date): ISODate | null {
  const mins = minutesOf(now);
  const today = toISODate(now);
  const day = mins < LATE_UNTIL ? addDays(today, -1) : mins >= closeDayFrom(s) ? today : null;
  return day && s.settings.closeDay?.last !== day ? day : null;
}

/** El día que se cierra al abrirlo a propósito (desde el aviso o su enlace): por la mañana, el de ayer. */
export function closeDayLinkDay(now: Date): ISODate {
  const today = toISODate(now);
  return now.getHours() < 12 ? addDays(today, -1) : today;
}

/** Cómo llamar al día siguiente del que se cierra: «mañana», u «hoy» si ya es de día. */
export function nextDayWord(day: ISODate, now: Date): 'mañana' | 'hoy' {
  return addDays(day, 1) === toISODate(now) && minutesOf(now) >= LATE_UNTIL ? 'hoy' : 'mañana';
}

/** Lo que falta de `today`. Si es hoy, lo que tiene hora y aún no ha llegado no se pregunta. */
export function closeDayQuestions(s: AppState, today: ISODate, now: Date): CloseQuestion[] {
  const out: CloseQuestion[] = [];
  const notYet = today === toISODate(now) ? toHHMM(now) : undefined;

  for (const h of [...s.habits].sort((a, b) => a.order - b.order)) {
    if (h.archived || localDay(h.createdAt) > today || !scheduled(h, today) || doneOn(h, s.habitLog[h.id], today)) continue;
    const text = h.target > 1 ? `¿Has llegado a ${h.target} ${h.unit || 'veces'} de «${h.name}»?` : `¿Has hecho «${h.name}»?`;
    out.push({ kind: 'habit', key: `h:${h.id}`, habit: h, text });
  }

  if (s.areas.some((a) => a.modules.includes('diary'))) {
    const logged = new Set(s.foodLog.filter((l) => l.date === today).map((l) => l.meal));
    const meals = s.areas
      .filter((a) => a.showOnToday && a.modules.includes('menu'))
      .flatMap((a) => todaysMenu(a, today))
      .filter((m, i, all) => !logged.has(m.meal) && all.findIndex((x) => x.meal === m.meal) === i)
      // Si no se reconoce nada de lo que lleva, decir «sí» no apuntaría nada: no se pregunta
      .filter((m) => mealFoods(m.text, s.customFoods).length > 0)
      .slice(0, MAX_MEALS);
    for (const m of meals) {
      out.push({
        kind: 'meal',
        key: `m:${m.meal}`,
        meal: m.meal,
        menuText: m.text,
        options: menuHasAlternatives(m.text) ? menuOptions(m.text) : [],
        text: `¿Comiste lo del menú en ${m.meal.toLowerCase()}?`,
      });
    }
  }

  const tasks = agendaForDate(s, today, areaMap(s)).filter(
    (i): i is Extract<AgendaItem, { kind: 'entry' } | { kind: 'plan' }> =>
      ((i.kind === 'entry' && i.entry.kind !== 'event') || i.kind === 'plan') && !i.done && !(notYet && i.time && i.time > notYet),
  );
  for (const i of tasks.slice(0, MAX_TASKS)) {
    const title = i.kind === 'entry' ? i.entry.title : i.item.title;
    out.push({ kind: 'task', key: i.key, item: i, text: `¿Has hecho «${title}»?`, moveIfNo: i.kind === 'entry' && i.entry.repeat === 'none' });
  }
  return out.slice(0, MAX_QUESTIONS);
}

/** Lo reconocible de lo que se comió (de una opción, o de todo si no hay opciones). Lo que no se reconoce no se apunta. */
export function mealFoods(text: string, custom: AppState['customFoods']): { food: FoodRef; grams: number }[] {
  return parseFoodText(menuOptions(text).join('\n'), custom)
    .filter((p) => p.food && p.grams > 0)
    .map((p) => ({ food: p.food!, grams: p.grams }));
}

export interface CloseSummary {
  habits: { done: number; due: number };
  kcal?: { eaten: number; target?: number };
  done: number;
  moved: number;
  /** La racha más larga que hay ahora mismo. */
  best?: { name: string; emoji: string; days: number };
  tomorrow: string[];
}

export function closeDaySummary(s: AppState, today: ISODate, answers: { done: number; moved: number }): CloseSummary {
  const active = s.habits.filter((h) => !h.archived && localDay(h.createdAt) <= today && scheduled(h, today));
  const habits = { done: active.filter((h) => doneOn(h, s.habitLog[h.id], today)).length, due: active.length };
  const logs = s.foodLog.filter((l) => l.date === today);
  // Solo si se apuntó algo (a quien no apunta comidas no le sale «0 kcal» cada noche)
  const kcal = logs.length ? { eaten: Math.round(logs.reduce((t, l) => t + l.kcal, 0)), target: s.nutritionTargets.kcal } : undefined;
  let best: CloseSummary['best'];
  for (const h of s.habits.filter((x) => !x.archived)) {
    const days = streak(h, s.habitLog[h.id], today);
    if (days > 1 && (!best || days > best.days)) best = { name: h.name, emoji: h.emoji, days };
  }
  const tomorrow = agendaForDate(s, addDays(today, 1), areaMap(s))
    .filter((i) => i.kind !== 'google' || i.time)
    .slice(0, 3)
    .map((i) => {
      const title = i.kind === 'entry' ? i.entry.title : i.kind === 'plan' ? i.item.title : i.kind === 'google' ? i.event.title : `Cumpleaños de ${i.birthday.name}`;
      return i.time ? `${i.time} ${title}` : title;
    });
  return { habits, kcal, done: answers.done, moved: answers.moved, best, tomorrow };
}
