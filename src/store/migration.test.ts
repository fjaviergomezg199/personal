import { describe, expect, it } from 'vitest';
import { normalizeState } from './store';
import type { AppState } from './types';

describe('migración de datos v1 → v3', () => {
  const v1 = {
    version: 1,
    areas: [
      { id: 'nut', name: 'Nutrición', template: 'nutrition', modules: ['menu', 'tasks', 'docs'], labels: { menu: 'Menú semanal', tasks: 'Lista de la compra' }, showOnToday: true, order: 0, emoji: '🥗', color: 'green', createdAt: '', updatedAt: '' },
      { id: 'casa', name: 'Casa', template: 'home', modules: ['tasks', 'notes'], labels: { tasks: 'Tareas de casa' }, showOnToday: true, order: 1, emoji: '🏠', color: 'amber', createdAt: '', updatedAt: '' },
      { id: 'run', name: 'Running', template: 'running', modules: ['plan'], showOnToday: true, order: 2, emoji: '🏃', color: 'orange', createdAt: '', updatedAt: '' },
    ],
    entries: [
      { id: 'e1', kind: 'task', title: 'Leche', areaId: 'nut', repeat: 'none', alert: null, createdAt: '', updatedAt: '' },
      { id: 'e2', kind: 'task', title: 'Pan', done: true, areaId: 'nut', repeat: 'none', alert: null, createdAt: '', updatedAt: '' },
      { id: 'e3', kind: 'task', title: 'Limpiar nevera', areaId: 'casa', repeat: 'none', alert: null, createdAt: '', updatedAt: '' },
      { id: 'e4', kind: 'reminder', title: 'Pagar comunidad', date: '2026-11-01', areaId: 'casa', repeat: 'monthly', alert: 900, createdAt: '', updatedAt: '' },
      { id: 'e5', kind: 'reminder', title: 'Dentista', date: '2026-10-22', repeat: 'none', alert: 15, createdAt: '', updatedAt: '' },
    ],
  } as unknown as Partial<AppState>;

  const s = normalizeState(v1);

  it('pasa la lista de la compra a la lista compartible', () => {
    expect(s.version).toBe(3);
    expect(s.listItems.filter((i) => i.list === 'compra').map((i) => [i.text, i.done])).toEqual([
      ['Leche', false],
      ['Pan', true],
    ]);
    const nut = s.areas.find((a) => a.id === 'nut')!;
    expect(nut.modules).toEqual(['menu', 'diary', 'metrics', 'shopping', 'docs']);
    expect(nut.labels?.tasks).toBeUndefined();
  });

  it('las tareas sin fecha de casa van a «Tareas de casa»; lo que tiene fecha se queda en la agenda', () => {
    expect(s.listItems.filter((i) => i.list === 'casa').map((i) => i.text)).toEqual(['Limpiar nevera']);
    const casa = s.areas.find((a) => a.id === 'casa')!;
    expect(casa.modules).toEqual(['shopping', 'chores', 'jointMoney', 'tasks', 'notes']);
    expect(s.entries.map((e) => e.id)).toEqual(['e4', 'e5']);
  });

  it('no toca otras áreas y crea los valores nuevos', () => {
    expect(s.areas.find((a) => a.id === 'run')!.modules).toEqual(['plan']);
    expect(s.metricTypes.map((m) => m.name)).toEqual(['Peso']);
    expect(s.foodLog).toEqual([]);
    expect(s.listPending).toEqual([]);
  });

  it('sin terminar la bienvenida no se crea el área de finanzas', () => {
    expect(s.areas.some((a) => a.modules.includes('money'))).toBe(false);
    expect(s.finance.movements).toEqual([]);
    expect(s.finance.accounts.personal).toEqual({ periodStarts: [], budgets: {}, stamps: {} });
  });

  it('no vuelve a migrar datos ya convertidos', () => {
    const again = normalizeState(s);
    expect(again.listItems).toHaveLength(3);
    expect(again.areas.find((a) => a.id === 'nut')!.modules).toEqual(s.areas.find((a) => a.id === 'nut')!.modules);
  });
});

describe('migración v2 → v3', () => {
  const v2 = {
    version: 2,
    settings: { name: 'Leire', onboarded: true },
    areas: [
      { id: 'h', name: 'Hogar', template: 'home', modules: ['shopping', 'chores', 'notes'], showOnToday: true, order: 0, emoji: '🏠', color: 'amber', createdAt: '', updatedAt: '' },
    ],
    listItems: [{ id: 'L1', list: 'compra', text: 'Leche', done: false, updatedAt: 1 }],
  } as unknown as Partial<AppState>;
  const s = normalizeState(v2);

  it('añade la cuenta conjunta al hogar y un área de finanzas', () => {
    expect(s.version).toBe(3);
    expect(s.areas[0].modules).toEqual(['shopping', 'chores', 'jointMoney', 'notes']);
    const money = s.areas.find((a) => a.template === 'money')!;
    expect(money).toMatchObject({ name: 'Finanzas', modules: ['money', 'jointMoney', 'notes'], order: 1 });
    expect(s.listItems).toHaveLength(1);
  });

  it('solo una vez', () => {
    const again = normalizeState(s);
    expect(again.areas.filter((a) => a.template === 'money')).toHaveLength(1);
  });
});
