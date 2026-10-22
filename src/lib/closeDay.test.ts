import { describe, expect, it } from 'vitest';
import { agendaForDate } from '../store/selectors';
import { getState, markDayClosed, normalizeState, replaceState, setCloseDayReminder } from '../store/store';
import type { AppState } from '../store/types';
import { closeDayCardDay, closeDayFrom, closeDayLinkDay, closeDayQuestions, closeDaySummary, mealFoods, nextDayWord } from './closeDay';
import { dueAlerts } from './notify';

const TODAY = '2026-10-21';
const addOne = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const at = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).toISOString();

function state(extra: Partial<AppState> = {}): AppState {
  return normalizeState({
    version: 4,
    settings: { name: 'Leyre', onboarded: true },
    areas: [
      {
        id: 'nut', name: 'Nutrición', emoji: '🥗', color: 'green', template: 'nutrition', modules: ['menu', 'diary'], showOnToday: true, order: 0, createdAt: '', updatedAt: '',
        menu: { meals: ['Desayuno', 'Comida', 'Cena'], days: { 2: { Desayuno: 'Café con leche', Comida: '150 g de pollo con 80 g de arroz', Cena: 'Opción 1: tortilla de 2 huevos\nOpción 2: 100 g de pavo' } } },
      },
    ],
    entries: [
      { id: 't1', kind: 'task', title: 'Devolver el libro', date: TODAY, repeat: 'none', alert: null, createdAt: at(TODAY), updatedAt: at(TODAY) },
      { id: 't2', kind: 'reminder', title: 'Pastilla', date: '2026-10-01', time: '09:00', repeat: 'daily', alert: null, createdAt: at(TODAY), updatedAt: at(TODAY) },
      { id: 't3', kind: 'task', title: 'Ya hecho', date: TODAY, done: true, repeat: 'none', alert: null, createdAt: at(TODAY), updatedAt: at(TODAY) },
      { id: 'c1', kind: 'reminder', title: '🌙 Cerrar el día', date: '2026-10-01', time: '22:00', repeat: 'daily', alert: 0, ritual: 'cierre', createdAt: at(TODAY), updatedAt: at(TODAY) },
      { id: 'e1', kind: 'event', title: 'Cena con amigos', date: TODAY, time: '21:30', repeat: 'none', alert: null, createdAt: at(TODAY), updatedAt: at(TODAY) },
      { id: 'm1', kind: 'event', title: 'Dentista', date: '2026-10-22', time: '10:00', repeat: 'none', alert: null, createdAt: at(TODAY), updatedAt: at(TODAY) },
    ],
    habits: [
      { id: 'h1', name: 'Agua', emoji: '💧', days: [], target: 8, unit: 'vasos', color: 'blue', order: 0, createdAt: at('2026-10-01') },
      { id: 'h2', name: 'Leer', emoji: '📖', days: [], target: 1, color: 'violet', order: 1, createdAt: at('2026-10-01') },
      { id: 'h3', name: 'Estirar', emoji: '🧘', days: [0], target: 1, color: 'green', order: 2, createdAt: at('2026-10-01') }, // solo los lunes
    ],
    habitLog: { h1: { [TODAY]: 3 }, h2: { [TODAY]: 1, '2026-10-20': 1, '2026-10-19': 1 } },
    foodLog: [{ id: 'f1', date: TODAY, meal: 'Desayuno', name: 'Café con leche', grams: 200, kcal: 80, protein: 6, carbs: 9, fat: 3, createdAt: at(TODAY) }],
    ...extra,
  } as unknown as Partial<AppState>);
}

describe('cerrar el día', () => {
  it('solo pregunta lo que falta: hábitos sin hacer, comidas sin apuntar y lo de hoy pendiente', () => {
    const qs = closeDayQuestions(state(), TODAY, new Date(`${TODAY}T22:00:00`));
    expect(qs.map((q) => q.text)).toEqual([
      '¿Has llegado a 8 vasos de «Agua»?',
      '¿Comiste lo del menú en comida?',
      '¿Comiste lo del menú en cena?',
      '¿Has hecho «Pastilla»?',
      '¿Has hecho «Devolver el libro»?',
    ]);
    // Lo de hoy va en el orden del día (lo que tiene hora, primero). Con opciones en el menú, se elige
    // con un botón; lo de un solo día pasa a mañana si no se hizo (lo que se repite, no)
    const cena = qs.find((q) => q.kind === 'meal' && q.meal === 'Cena');
    expect(cena && cena.kind === 'meal' && cena.options).toEqual(['tortilla de 2 huevos', '100 g de pavo']);
    expect(qs.filter((q) => q.kind === 'task').map((q) => q.kind === 'task' && q.moveIfNo)).toEqual([false, true]);
  });

  it('no pregunta lo que aún no ha llegado ni comidas que no se pueden apuntar', () => {
    const s = state();
    const early = closeDayQuestions(s, TODAY, new Date(`${TODAY}T08:30:00`)).map((q) => q.text);
    expect(early).not.toContain('¿Has hecho «Pastilla»?');
    expect(early).toContain('¿Has hecho «Devolver el libro»?');
    // Cerrando el día de madrugada, ya ha pasado todo
    expect(closeDayQuestions(s, TODAY, new Date('2026-10-22T00:40:00')).map((q) => q.text)).toContain('¿Has hecho «Pastilla»?');
    s.areas[0].menu!.days[2].Comida = 'Lo que sobre de ayer';
    expect(closeDayQuestions(s, TODAY, new Date(`${TODAY}T22:00:00`)).map((q) => q.text)).not.toContain('¿Comiste lo del menú en comida?');
  });

  it('nunca más de 10 preguntas', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, name: `Hábito ${i}`, emoji: '⭐', days: [], target: 1, color: 'blue', order: 10 + i, createdAt: at('2026-10-01') }));
    const s = state();
    s.habits.push(...(many as AppState['habits']));
    const qs = closeDayQuestions(s, TODAY, new Date(`${TODAY}T22:00:00`));
    expect(qs).toHaveLength(10);
    expect(qs.filter((q) => q.kind === 'habit')).toHaveLength(10);
  });

  it('sin diario de comidas no pregunta por el menú', () => {
    const s = state();
    s.areas[0].modules = ['menu'];
    expect(closeDayQuestions(s, TODAY, new Date(`${TODAY}T22:00:00`)).some((q) => q.kind === 'meal')).toBe(false);
  });

  it('de una comida se apunta lo que se reconoce', () => {
    expect(mealFoods('150 g de pollo con 80 g de arroz', []).map((f) => [f.food.key, f.grams])).toEqual([
      ['pollo', 150],
      ['arroz', 80],
    ]);
  });

  it('la tarjeta sale desde las 20:00, o una hora antes del aviso si es más pronto', () => {
    expect(closeDayFrom(state())).toBe(20 * 60);
    const s = state();
    s.settings.closeDay = { remind: true, time: '19:30', entryId: 'c1' };
    expect(closeDayFrom(s)).toBe(18 * 60 + 30);
    // Un aviso de madrugada no adelanta la tarjeta (ni la deja todo el día)
    s.settings.closeDay.time = '00:30';
    expect(closeDayFrom(s)).toBe(20 * 60);
    // Si su recordatorio ya no existe, cuenta como sin aviso
    s.settings.closeDay = { remind: true, time: '19:30', entryId: 'borrado' };
    expect(closeDayFrom(s)).toBe(20 * 60);
  });

  it('de madrugada se cierra todavía el día anterior', () => {
    const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`);
    const s = state();
    expect(closeDayCardDay(s, at(TODAY, '19:59'))).toBeNull();
    expect(closeDayCardDay(s, at(TODAY, '21:30'))).toBe(TODAY);
    expect(closeDayCardDay(s, at('2026-10-22', '00:40'))).toBe(TODAY);
    expect(closeDayCardDay(s, at('2026-10-22', '04:00'))).toBeNull();
    s.settings.closeDay = { remind: false, time: '22:00', last: TODAY };
    expect(closeDayCardDay(s, at(TODAY, '23:00'))).toBeNull();
    expect(closeDayCardDay(s, at('2026-10-22', '00:40'))).toBeNull();
    // Abierto a propósito (aviso o enlace): por la mañana es el de ayer
    expect(closeDayLinkDay(at('2026-10-22', '09:00'))).toBe(TODAY);
    expect(closeDayLinkDay(at(TODAY, '22:05'))).toBe(TODAY);
    expect(nextDayWord(TODAY, at(TODAY, '22:05'))).toBe('mañana');
    expect(nextDayWord(TODAY, at('2026-10-22', '00:40'))).toBe('mañana');
    expect(nextDayWord(TODAY, at('2026-10-22', '09:00'))).toBe('hoy');
  });

  it('el aviso de cada noche es un recordatorio propio: avisa, no sale en la agenda y se calla al cerrar el día', () => {
    replaceState(state({ entries: [] }));
    setCloseDayReminder(true, '22:00', 'https://app/#/hoy?cerrar=1');
    const id = getState().settings.closeDay!.entryId!;
    const e = getState().entries.find((x) => x.id === id)!;
    expect(e).toMatchObject({ kind: 'reminder', ritual: 'cierre', repeat: 'daily', time: '22:00', alert: 0, url: 'https://app/#/hoy?cerrar=1' });
    expect(agendaForDate(getState(), e.date!)).toEqual([]);
    const night = new Date(`${e.date}T22:01:00`);
    expect(dueAlerts(getState(), night).map((a) => [a.title, a.route])).toEqual([['🌙 Cerrar el día', '#/hoy?cerrar=1']]);
    markDayClosed(e.date!);
    expect(dueAlerts(getState(), night)).toEqual([]);
    expect(getState().settings.closeDay?.last).toBe(e.date);
    // Cambiar la hora reutiliza el mismo; quitarlo lo borra
    setCloseDayReminder(true, '00:30', 'https://app/#/hoy?cerrar=1');
    expect(getState().entries.filter((x) => x.ritual).map((x) => [x.id, x.time])).toEqual([[id, '00:30']]);
    // A las 00:30 avisa por el día anterior: cerrar ese día calla el aviso de esa madrugada
    const late = new Date(`${addOne(e.date!)}T00:31:00`);
    expect(dueAlerts(getState(), late)).toHaveLength(1);
    markDayClosed(e.date!);
    expect(dueAlerts(getState(), late)).toEqual([]);
    setCloseDayReminder(false, '00:30', '');
    expect(getState().entries.some((x) => x.ritual)).toBe(false);
    expect(getState().settings.closeDay).toMatchObject({ remind: false, entryId: undefined });
  });

  it('el resumen cuenta hábitos, calorías, racha y lo de mañana (sin el aviso de la app)', () => {
    const r = closeDaySummary(state(), TODAY, { done: 1, moved: 1 });
    expect(r.habits).toEqual({ done: 1, due: 2 });
    expect(r.kcal).toEqual({ eaten: 80, target: undefined });
    expect(r.best).toEqual({ name: 'Leer', emoji: '📖', days: 3 });
    expect(r.tomorrow).toEqual(['09:00 Pastilla', '10:00 Dentista']);
    // A quien no apunta comidas no le sale «0 kcal»
    expect(closeDaySummary(state({ foodLog: [] }), TODAY, { done: 0, moved: 0 }).kcal).toBeUndefined();
  });
});
