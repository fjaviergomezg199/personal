import { describe, expect, it } from 'vitest';
import { normalizeState } from '../store/store';
import type { AppState, Entry } from '../store/types';
import { habitRate, hasContent, summaryWeekFor, weekSummary } from './weekSummary';

// Semana del lunes 19 al domingo 25 de octubre de 2026
const MON = '2026-10-19';
const at = (date: string, h = 12) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00`).toISOString();
const ms = (date: string) => Date.parse(at(date));

const entry = (p: Partial<Entry>): Entry => ({ id: p.title ?? 'x', kind: 'task', title: 'x', repeat: 'none', alert: null, createdAt: at('2026-10-01'), updatedAt: at('2026-10-01'), ...p });

function state(): AppState {
  return normalizeState({
    version: 4,
    settings: { name: 'Leyre', onboarded: true },
    areas: [{ id: 'run', name: 'Running', emoji: '🏃', color: 'orange', template: 'running', modules: ['plan'], showOnToday: true, order: 0, createdAt: '', updatedAt: '' }],
    entries: [
      entry({ title: 'Entregar el trabajo', done: true, doneAt: at('2026-10-20') }),
      entry({ title: 'Pedir cita', done: true, updatedAt: at('2026-10-23') }), // de antes de guardar «doneAt»
      entry({ title: 'Hecho la semana pasada', done: true, doneAt: at('2026-10-14') }),
      entry({ title: 'Pendiente' }),
      entry({ title: 'Sacar la basura', kind: 'reminder', date: '2026-10-05', time: '21:00', repeat: 'weekly', doneDates: ['2026-10-12', '2026-10-19'] }),
      entry({ title: 'Cena en el Txoko', kind: 'event', date: '2026-10-24', time: '21:30', shared: true }),
      entry({ title: 'Cine', kind: 'event', date: '2026-10-27', time: '18:00' }),
    ],
    plan: [
      { id: 'p1', areaId: 'run', date: '2026-10-20', title: 'Rodaje 6 km', done: true, createdAt: '', updatedAt: '' },
      { id: 'p2', areaId: 'run', date: '2026-10-22', title: 'Series', done: true, createdAt: '', updatedAt: '' },
      { id: 'p3', areaId: 'run', date: '2026-10-25', title: 'Tirada larga', createdAt: '', updatedAt: '' },
      { id: 'p4', areaId: 'run', date: '2026-10-28', title: 'Otra semana', createdAt: '', updatedAt: '' },
    ],
    habits: [{ id: 'h1', name: 'Agua', emoji: '💧', days: [], target: 1, color: 'blue', order: 0, createdAt: at('2026-10-01') }],
    habitLog: { h1: { '2026-10-19': 1, '2026-10-20': 1, '2026-10-22': 1, '2026-10-23': 1, '2026-10-24': 1, '2026-10-25': 1 } },
    finance: {
      movements: [
        { id: 'm1', scope: 'personal', kind: 'gasto', date: '2026-10-21', amount: 45.3, category: 'super', updatedAt: 1 },
        { id: 'm2', scope: 'personal', kind: 'gasto', date: '2026-10-24', amount: 60, category: 'ocio', updatedAt: 1 },
        { id: 'm3', scope: 'personal', kind: 'gasto', date: '2026-10-14', amount: 100, category: 'ocio', updatedAt: 1 },
        { id: 'm4', scope: 'personal', kind: 'gasto', date: '2026-10-22', amount: 99, category: 'ocio', updatedAt: 1, deleted: true },
        { id: 'm5', scope: 'hogar', kind: 'gasto', date: '2026-10-19', amount: 84.2, category: 'super', updatedAt: 1 },
      ],
      recurring: [],
      accounts: { personal: { periodStarts: [], budgets: {}, stamps: {} }, hogar: { periodStarts: [], budgets: {}, stamps: {} } },
      pending: [],
    },
    metrics: [
      { id: 'w1', metricId: 'peso', date: '2026-10-12', value: 72.4 },
      { id: 'w2', metricId: 'peso', date: '2026-10-19', value: 72.1 },
      { id: 'w3', metricId: 'peso', date: '2026-10-25', value: 71.8 },
    ],
    foodLog: [
      { id: 'f1', date: '2026-10-20', meal: 'Comida', name: 'Pollo', grams: 150, kcal: 1200, protein: 0, carbs: 0, fat: 0, createdAt: '' },
      { id: 'f2', date: '2026-10-20', meal: 'Cena', name: 'Merluza', grams: 200, kcal: 600, protein: 0, carbs: 0, fat: 0, createdAt: '' },
      { id: 'f3', date: '2026-10-21', meal: 'Comida', name: 'Arroz', grams: 80, kcal: 1600, protein: 0, carbs: 0, fat: 0, createdAt: '' },
    ],
    nutritionTargets: { kcal: 1800 },
    goals: [{ id: 'g1', title: 'Correr', target: 3, unit: 'veces', period: 'week', progress: { '2026-W43': 2 }, createdAt: at('2026-10-01'), updatedAt: '' }],
    listItems: [
      { id: 'L1', list: 'compra', text: 'Leche', done: true, updatedAt: ms('2026-10-21') },
      { id: 'L2', list: 'compra', text: 'Pan', done: true, updatedAt: ms('2026-10-10') },
      { id: 'L3', list: 'casa', text: 'Limpiar la nevera', done: true, updatedAt: ms('2026-10-24'), by: 'Leyre' },
      { id: 'L4', list: 'casa', text: 'Bajar el reciclaje', done: true, updatedAt: ms('2026-10-24'), by: 'Javi' },
    ],
  } as unknown as Partial<AppState>);
}

describe('resumen de la semana', () => {
  it('cuenta lo hecho, los planes, los entrenos y los hábitos', () => {
    const w = weekSummary(state(), MON, '2026-10-25');
    expect(w.end).toBe('2026-10-25');
    expect(w.done.map((d) => [d.title, d.date])).toEqual([
      ['Sacar la basura', '2026-10-19'],
      ['Entregar el trabajo', '2026-10-20'],
      ['Pedir cita', '2026-10-23'],
      ['Limpiar la nevera', '2026-10-24'], // la del otro no cuenta como mía
    ]);
    expect(w.plans.map((p) => [p.title, p.date, !!p.shared])).toEqual([['Cena en el Txoko', '2026-10-24', true]]);
    expect(w.sessions.map((x) => [x.area.name, x.done, x.total])).toEqual([['Running', 2, 3]]);
    expect(w.habits[0].days).toEqual(['done', 'done', 'miss', 'done', 'done', 'done', 'done']);
    expect(habitRate(w)).toBeCloseTo(6 / 7);
  });

  it('dinero, peso, calorías, objetivos y compra', () => {
    const w = weekSummary(state(), MON, '2026-10-25');
    expect(w.money).toEqual([
      { scope: 'personal', spent: 105.3, prev: 100, top: [{ key: 'ocio', amount: 60 }, { key: 'super', amount: 45.3 }] },
      { scope: 'hogar', spent: 84.2, prev: 0, top: [{ key: 'super', amount: 84.2 }] },
    ]);
    expect(w.weight).toMatchObject({ value: 71.8, unit: 'kg' });
    expect(w.weight?.delta).toBeCloseTo(-0.6);
    expect(w.kcal).toEqual({ avg: 1700, days: 2, target: 1800 });
    expect(w.goals.map((g) => [g.goal.title, g.value])).toEqual([['Correr', 2]]);
    expect(w.bought).toBe(1);
    expect(hasContent(w)).toBe(true);
  });

  it('a mitad de semana cuenta hasta hoy y adelanta la siguiente', () => {
    const w = weekSummary(state(), MON, '2026-10-21');
    expect(w.until).toBe('2026-10-21');
    expect(w.habits[0].days.slice(3)).toEqual(['future', 'future', 'future', 'future']);
    expect(w.plans).toEqual([]);
    expect(w.next.map((i) => (i.kind === 'entry' ? i.entry.title : i.key))).toEqual(['Cine']);
  });

  it('el domingo se resume la semana que acaba; el lunes, la que acabó; los demás días, nada', () => {
    expect(summaryWeekFor('2026-10-25')).toBe(MON);
    expect(summaryWeekFor('2026-10-26')).toBe(MON);
    expect(summaryWeekFor('2026-10-21')).toBeNull();
  });

  it('una semana sin nada apuntado no tiene resumen', () => {
    const w = weekSummary(normalizeState({ version: 4, settings: { onboarded: true } } as unknown as Partial<AppState>), MON, '2026-10-25');
    expect(hasContent(w)).toBe(false);
  });
});

describe('lo compartido', () => {
  it('de las tareas en pareja, solo cuenta lo que marcó uno mismo', () => {
    const s = state();
    s.entries.push(
      entry({ title: 'Comprar el regalo de mamá', shared: true, by: 'Javi', done: true, doneAt: at('2026-10-21') }),
      entry({ title: 'Reservar la casa rural', shared: true, by: 'Leyre', done: true, doneAt: at('2026-10-22') }),
    );
    const titles = weekSummary(s, MON, '2026-10-25').done.map((d) => d.title);
    expect(titles).toContain('Reservar la casa rural');
    expect(titles).not.toContain('Comprar el regalo de mamá');
  });
});

describe('gastos de la semana', () => {
  it('las categorías que ya no existen se juntan en «Otros»', () => {
    const s = state();
    s.finance.movements.push(
      { id: 'x1', scope: 'personal', kind: 'gasto', date: '2026-10-20', amount: 10, category: 'vieja', updatedAt: 1 },
      { id: 'x2', scope: 'personal', kind: 'gasto', date: '2026-10-21', amount: 5, category: 'otra-vieja', updatedAt: 1 },
    );
    const top = weekSummary(s, MON, '2026-10-25').money[0].top;
    expect(top).toEqual([
      { key: 'ocio', amount: 60 },
      { key: 'super', amount: 45.3 },
      { key: 'otros', amount: 15 },
    ]);
  });
});
