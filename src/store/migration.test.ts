import { describe, expect, it } from 'vitest';
import { legacyOf } from './migrate';
import { normalizeState } from './store';
import type { AppState } from './types';

/** Datos como los que hay ahora en los móviles (versión 4). */
const v4 = {
  version: 4,
  settings: { name: 'Leyre', onboarded: true, todayLayout: [{ key: 'menu' }], simpleToday: true, closeDay: { remind: true, time: '22:00', entryId: 'rit' }, defaultAlert: 30 },
  areas: [
    { id: 'est', name: 'Estudios', emoji: '📚', color: 'violet', template: 'studies', modules: ['plan', 'tasks'], showOnToday: true, order: 0, createdAt: 'a', updatedAt: 'a' },
    { id: 'run', name: 'Running', emoji: '🏃', color: 'orange', template: 'running', modules: ['plan', 'goals'], showOnToday: true, order: 1, createdAt: 'b', updatedAt: 'b' },
    { id: 'nut', name: 'Nutrición', emoji: '🥗', color: 'green', template: 'nutrition', modules: ['menu', 'diary'], showOnToday: true, order: 2, menu: { meals: ['Cena'], days: {} }, createdAt: 'c', updatedAt: 'c' },
  ],
  entries: [
    { id: 'e1', kind: 'event', title: 'Dentista', date: '2026-10-22', time: '10:00', repeat: 'none', alert: 60, category: 'health', createdAt: '', updatedAt: '' },
    { id: 'e2', kind: 'task', title: 'Entregar trabajo', date: '2026-10-30', areaId: 'est', repeat: 'none', alert: null, createdAt: '', updatedAt: '' },
    { id: 'e3', kind: 'event', title: 'Cine', date: '2026-10-25', time: '18:00', repeat: 'none', alert: 30, shared: true, by: 'Javi', createdAt: '', updatedAt: '', google: { id: 'g3', calendarId: 'primary' } },
    { id: 'rit', kind: 'reminder', title: '🌙 Cerrar el día', date: '2026-10-21', time: '22:00', repeat: 'daily', alert: 0, ritual: 'cierre', createdAt: '', updatedAt: '', google: { id: 'gR', calendarId: 'primary' } },
  ],
  plan: [
    { id: 'p1', areaId: 'run', date: '2026-10-28', time: '19:00', title: 'Rodaje suave 6 km', details: 'Ritmo 6:15', done: true, result: '6 km en 37:10', createdAt: 'x', updatedAt: 'y' },
    { id: 'p2', areaId: 'est', date: '2026-10-29', title: 'Tema 3: El Románico', createdAt: 'x', updatedAt: 'y' },
  ],
  goals: [{ id: 'g1', areaId: 'run', title: 'Correr 3 veces', target: 3, period: 'week', progress: {} }],
  listItems: [{ id: 'L1', list: 'compra', text: 'Leche', done: false, updatedAt: 1 }],
  finance: { movements: [{ id: 'M1', scope: 'personal', kind: 'gasto', date: '2026-10-20', amount: 12, category: 'super', updatedAt: 1 }], recurring: [], accounts: {}, pending: [] },
  foodLog: [{ id: 'f1', date: '2026-10-21', meal: 'Cena', name: 'Merluza', grams: 200, kcal: 180, protein: 36, carbs: 0, fat: 3 }],
  share: { url: 'https://script.google.com/macros/s/x/exec', key: 'K', name: 'Hogar' },
  habits: [{ id: 'h1', name: 'Leer', emoji: '📖', days: [], target: 1, color: 'violet', order: 0, createdAt: '' }],
  habitLog: { h1: { '2026-10-21': 1 } },
  birthdays: [{ id: 'b1', name: 'Marta', day: 22, month: 10, createdAt: '', updatedAt: '' }],
  googleDeletes: [],
} as unknown as Partial<AppState>;

describe('de la versión 4 a la agenda con categorías', () => {
  const s = normalizeState(v4);

  it('las áreas que tenían algo pasan a ser categorías con su nombre, color y emoji', () => {
    expect(s.version).toBe(5);
    expect(s.categories.map((c) => [c.id, c.name, c.color, c.emoji, c.order])).toEqual([
      ['est', 'Estudios', 'violet', '📚', 0],
      ['run', 'Running', 'orange', '🏃', 1],
    ]);
  });

  it('las sesiones de los planes pasan al calendario como tareas de su categoría', () => {
    const p1 = s.entries.find((e) => e.id === 'p1')!;
    expect(p1).toMatchObject({ kind: 'task', title: 'Rodaje suave 6 km', date: '2026-10-28', time: '19:00', categoryId: 'run', done: true, repeat: 'none', alert: null });
    expect(p1.notes).toBe('Ritmo 6:15\n\nResultado: 6 km en 37:10');
    expect(s.entries.find((e) => e.id === 'p2')).toMatchObject({ categoryId: 'est', title: 'Tema 3: El Románico' });
  });

  it('cada plan queda como una importación: se ve en Ajustes y se puede quitar de una vez', () => {
    expect(s.entries.find((e) => e.id === 'p1')!.importId).toBe('v4-run');
    expect(s.entries.find((e) => e.id === 'p2')!.importId).toBe('v4-est');
    expect(s.imports.map((b) => [b.id, b.name, b.count])).toEqual([
      ['v4-run', 'Plan · Running', 1],
      ['v4-est', 'Plan · Estudios', 1],
    ]);
    const named = normalizeState({ ...v4, areas: [{ ...(v4 as { areas: object[] }).areas[1], labels: { plan: 'Entrenamientos' } }] } as unknown as Partial<AppState>);
    expect(named.imports.map((b) => b.name)).toEqual(['Entrenamientos · Running', 'Plan anterior']);
  });

  it('lo de la agenda sigue igual (con su categoría), sin lo del hogar compartido', () => {
    expect(s.entries.find((e) => e.id === 'e2')!.categoryId).toBe('est');
    const cine = s.entries.find((e) => e.id === 'e3')! as unknown as Record<string, unknown>;
    expect(cine.shared).toBeUndefined();
    expect(cine.by).toBeUndefined();
    expect(cine.google).toEqual({ id: 'g3', calendarId: 'primary' });
    expect((s.entries.find((e) => e.id === 'e1') as unknown as Record<string, unknown>).category).toBeUndefined();
  });

  it('el aviso de «Cerrar el día» desaparece, también de Google Calendar', () => {
    expect(s.entries.some((e) => e.id === 'rit')).toBe(false);
    expect(s.googleDeletes).toEqual([{ id: 'gR', calendarId: 'primary' }]);
    expect((s.settings as unknown as Record<string, unknown>).closeDay).toBeUndefined();
    expect((s.settings as unknown as Record<string, unknown>).todayLayout).toBeUndefined();
    expect(s.settings.defaultAlert).toBe(30);
  });

  it('hábitos y cumpleaños se quedan', () => {
    expect(s.habits.map((h) => h.name)).toEqual(['Leer']);
    expect(s.habitLog.h1['2026-10-21']).toBe(1);
    expect(s.birthdays.map((b) => b.name)).toEqual(['Marta']);
  });

  it('lo que ya no se usa no se pierde: se guarda aparte', () => {
    const legacy = legacyOf(v4)!;
    expect(Object.keys(legacy).sort()).toEqual(['areas', 'finance', 'foodLog', 'goals', 'listItems', 'plan', 'share', 'version'].sort());
    expect(legacy.version).toBe(4);
    expect(legacyOf(s)).toBeNull();
    const keys = Object.keys(s).sort();
    expect(keys).toEqual(['birthdays', 'categories', 'entries', 'googleCalendars', 'googleDeletes', 'googleEvents', 'habitLog', 'habits', 'imports', 'notified', 'settings', 'version']);
  });

  it('no vuelve a migrar lo ya convertido', () => {
    const again = normalizeState(s);
    expect(again.entries).toEqual(s.entries);
    expect(again.categories).toEqual(s.categories);
  });

  it('una copia de la versión 1 también entra', () => {
    const v1 = normalizeState({
      version: 1,
      areas: [{ id: 'casa', name: 'Casa', emoji: '🏠', color: 'amber', modules: ['tasks'], order: 0 }],
      entries: [{ id: 'x', kind: 'task', title: 'Limpiar nevera', areaId: 'casa', repeat: 'none', alert: null, createdAt: '', updatedAt: '' }],
    } as unknown as Partial<AppState>);
    expect(v1.categories.map((c) => c.name)).toEqual(['Casa']);
    expect(v1.entries[0].categoryId).toBe('casa');
  });
});
