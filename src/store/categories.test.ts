import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addCategory, addEntry, deleteCategory, getState, importEntries, moveCategory, normalizeState, replaceState, restoreCategory, toggleCategoryHidden, undoImport, updateCategory } from './store';
import { agendaForRange, overdueEntries, pendingEntries } from './selectors';
import type { AppState } from './types';

vi.mock('./db', () => ({
  files: { get: async () => undefined, put: async () => undefined, del: async () => undefined },
  kv: { get: async () => undefined, set: async () => undefined },
}));

const now = new Date().toISOString();
const base = { kind: 'task' as const, repeat: 'none' as const, alert: null };

beforeEach(() => {
  replaceState(
    normalizeState({
      settings: { name: 'Javi', onboarded: true },
      categories: [
        { id: 'run', name: 'Running', color: 'orange', emoji: '🏃', order: 0, createdAt: now },
        { id: 'sig', name: '2Sigma', color: 'blue', order: 1, createdAt: now },
      ],
    } as unknown as Partial<AppState>),
  );
});

describe('categorías', () => {
  it('crear una nueva; con el mismo nombre (sin mirar mayúsculas ni tildes) devuelve la que hay', () => {
    const id = addCategory('  Inglés   B2 ', 'teal');
    const c = getState().categories.find((x) => x.id === id)!;
    expect(c).toMatchObject({ name: 'Inglés B2', color: 'teal', order: 2 });
    expect(addCategory('ingles b2', 'rose')).toBe(id);
    expect(addCategory('2sigma', 'green')).toBe('sig');
    expect(getState().categories).toHaveLength(3);
  });

  it('borrarla deja lo suyo sin categoría, y deshacer lo devuelve todo', () => {
    const a = addEntry({ ...base, title: 'Rodaje', date: '2026-11-02', categoryId: 'run' });
    const b = addEntry({ ...base, title: 'Otra cosa', categoryId: 'sig' });
    toggleCategoryHidden('run');
    const undo = deleteCategory('run');
    let s = getState();
    expect(s.categories.map((c) => [c.id, c.order])).toEqual([['sig', 0]]);
    expect(s.entries.find((e) => e.id === a)!.categoryId).toBeUndefined();
    expect(s.entries.find((e) => e.id === b)!.categoryId).toBe('sig');
    expect(s.settings.hiddenCategories).toEqual([]);
    expect(undo.entryIds).toEqual([a]);

    restoreCategory(undo.category!, undo.entryIds);
    s = getState();
    expect(s.categories.map((c) => [c.id, c.order])).toEqual([['run', 0], ['sig', 1]]);
    expect(s.entries.find((e) => e.id === a)!.categoryId).toBe('run');
  });

  it('cambiar el color vuelve a enviar a Google lo que ya estaba allí (para que cambie de color)', () => {
    const a = addEntry({ ...base, title: 'Reunión', date: '2026-11-02', categoryId: 'sig' });
    replaceState({ ...getState(), entries: getState().entries.map((e) => (e.id === a ? { ...e, google: { id: 'ev1', calendarId: 'primary' }, dirty: false } : e)) });
    updateCategory('sig', { name: '2Sigma' });
    expect(getState().entries[0].dirty).toBe(false);
    updateCategory('sig', { color: 'violet', emoji: '🧘' });
    expect(getState().categories.find((c) => c.id === 'sig')).toMatchObject({ color: 'violet', emoji: '🧘' });
    expect(getState().entries[0].dirty).toBe(true);
  });

  it('subir y bajar', () => {
    moveCategory('sig', -1);
    expect(getState().categories.map((c) => c.id)).toEqual(['sig', 'run']);
    moveCategory('sig', -1);
    expect(getState().categories.map((c) => c.id)).toEqual(['sig', 'run']);
  });
});

describe('importar al calendario', () => {
  it('todo lo importado va junto y se puede quitar de una vez (también de Google)', () => {
    const mine = addEntry({ ...base, title: 'Lo mío', date: '2026-11-03', categoryId: 'run' });
    const { batchId, ids } = importEntries('Plan 10K', [
      { ...base, title: 'Rodaje 6 km', date: '2026-11-02', time: '19:00', categoryId: 'run' },
      { ...base, title: 'Series 6x400', date: '2026-11-04', time: '19:00', categoryId: 'run' },
    ]);
    let s = getState();
    expect(ids).toHaveLength(2);
    expect(s.imports).toEqual([{ id: batchId, name: 'Plan 10K', count: 2, at: expect.any(String) }]);
    expect(s.entries.filter((e) => e.importId === batchId).map((e) => e.title)).toEqual(['Rodaje 6 km', 'Series 6x400']);

    // Una ya subida a Google: al deshacer, se borra también allí
    replaceState({ ...s, entries: s.entries.map((e) => (e.id === ids[0] ? { ...e, google: { id: 'g1', calendarId: 'primary' } } : e)) });
    undoImport(batchId);
    s = getState();
    expect(s.entries.map((e) => e.id)).toEqual([mine]);
    expect(s.imports).toEqual([]);
    expect(s.googleDeletes).toEqual([{ id: 'g1', calendarId: 'primary' }]);
  });

  it('una sesión de un plan importado que no se hizo no se arrastra a «de otros días»', () => {
    const todo = addEntry({ ...base, title: 'Renovar el DNI', date: '2026-10-20' });
    importEntries('Plan 10K', [{ ...base, title: 'Rodaje 6 km', date: '2026-10-21', categoryId: 'run' }]);
    expect(overdueEntries(getState(), '2026-10-28').map((e) => e.id)).toEqual([todo]);
  });
});

describe('planes de varios días', () => {
  it('salen todos los días, los primeros, y lo pendiente no pasa a «de otros días» hasta que acaban', () => {
    const trip = addEntry({ ...base, kind: 'event', title: 'Finde en Jaca', date: '2026-11-13', endDate: '2026-11-15' });
    addEntry({ ...base, kind: 'event', title: 'Cena', date: '2026-11-14' });
    const job = addEntry({ ...base, title: 'Mudanza', date: '2026-11-13', endDate: '2026-11-15' });
    const days = agendaForRange(getState(), '2026-11-12', '2026-11-16');
    const ids = (d: string) => (days.get(d) ?? []).map((i) => (i.kind === 'entry' ? i.entry.title : ''));
    expect(ids('2026-11-12')).toEqual([]);
    expect(ids('2026-11-14')).toEqual(['Finde en Jaca', 'Mudanza', 'Cena']);
    expect(ids('2026-11-15')).toEqual(['Finde en Jaca', 'Mudanza']);
    expect(ids('2026-11-16')).toEqual([]);
    expect(overdueEntries(getState(), '2026-11-14').map((e) => e.id)).toEqual([]);
    expect(overdueEntries(getState(), '2026-11-16').map((e) => e.id)).toEqual([job]);
    expect(trip).toBeTruthy();
  });
});


describe('📌 pendientes', () => {
  it('lo sin fecha y lo que se quedó de otros días; arriba lo importante y luego lo último', () => {
    const at = (d: string) => `${d}T10:00:00.000Z`;
    replaceState(
      normalizeState({
        settings: { name: 'Javi', onboarded: true },
        entries: [
          { ...base, id: 'old', title: 'Llamar a Fulanito', createdAt: at('2026-10-01'), updatedAt: now },
          { ...base, id: 'new', title: 'Leer el contrato', notes: 'Cláusula 4', createdAt: at('2026-10-27'), updatedAt: now },
          { ...base, id: 'star', title: 'Renovar el DNI', important: true, createdAt: at('2026-09-01'), updatedAt: now },
          { ...base, id: 'late', kind: 'reminder', title: 'Pagar la academia', date: '2026-10-26', createdAt: at('2026-10-20'), updatedAt: now },
          { ...base, id: 'done', title: 'Ya hecho', done: true, createdAt: now, updatedAt: now },
          { ...base, id: 'later', title: 'Para el viernes', date: '2026-10-30', createdAt: now, updatedAt: now },
          { ...base, id: 'plan', kind: 'event', title: 'Cena', date: '2026-10-20', createdAt: now, updatedAt: now },
        ],
      } as unknown as Partial<AppState>),
    );
    expect(pendingEntries(getState(), '2026-10-28').map((e) => e.id)).toEqual(['star', 'new', 'late', 'old']);
  });
});
