import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncShare } from '../lib/shareSync';
import { fakeGoogle } from '../lib/testing/fakeGoogle';
import { partnerName } from './selectors';
import { addEntry, deleteEntry, getState, normalizeState, replaceState, restoreEntry, toggleEntryDone, update, updateEntry } from './store';
import type { AppState } from './types';

const SHARE = { url: 'https://script.google.com/macros/s/AKfy_test/exec', key: 'CLAVE123', name: 'Hogar' };
const fresh = (extra: Partial<AppState> = {}) =>
  replaceState(normalizeState({ settings: { name: 'Leyre', onboarded: true }, share: { ...SHARE }, ...extra } as Partial<AppState>));
const cine = { kind: 'event', title: 'Cine', date: '2026-10-25', time: '18:00', repeat: 'none', alert: 30 } as const;
const clearPending = () => update((s) => void (s.planPending = []), { silent: true });

beforeEach(() => fresh());
afterEach(() => vi.unstubAllGlobals());

describe('planes en pareja en este móvil', () => {
  it('se apunta para enviar lo que ven los dos, no el aviso ni el área', () => {
    const id = addEntry({ ...cine, shared: true });
    addEntry({ ...cine, title: 'Dentista' });
    expect(getState().planPending).toEqual([id]);
    expect(getState().entries.find((e) => e.id === id)?.by).toBe('Leyre');
    clearPending();
    updateEntry(id, { alert: 60, areaId: 'ocio' });
    expect(getState().planPending).toEqual([]);
    updateEntry(id, { time: '18:30' });
    expect(getState().planPending).toEqual([id]);
    clearPending();
    toggleEntryDone(id);
    expect(getState().planPending).toEqual([id]);
  });

  it('borrarlo deja constancia para el otro móvil; deshacer lo recupera más nuevo', () => {
    const id = addEntry({ ...cine, shared: true });
    const copy = structuredClone(getState().entries.find((e) => e.id === id)!);
    deleteEntry(id);
    const gone = getState().planGone;
    expect(gone.map((g) => g.id)).toEqual([id]);
    restoreEntry(copy);
    const back = getState().entries.find((e) => e.id === id)!;
    expect(getState().planGone).toEqual([]);
    expect(Date.parse(back.updatedAt)).toBeGreaterThan(gone[0].at);
    expect(getState().planPending).toEqual([id]);
  });

  it('se sabe cómo se llama la otra persona por lo que apunta', () => {
    fresh({
      listItems: [
        { id: 'L1', list: 'compra', text: 'Leche', done: false, updatedAt: 5, by: 'Leyre' },
        { id: 'L2', list: 'compra', text: 'Pan', done: false, updatedAt: 9, by: 'Javi' },
      ],
    });
    expect(partnerName(getState())).toBe('Javi');
    fresh();
    expect(partnerName(getState())).toBeUndefined();
  });
});

describe('planes en pareja con la hoja', () => {
  it('con el código antiguo de la hoja esperan, y se envían al actualizarlo', async () => {
    const bodies: (string | null)[] = [];
    const v3 = vi.fn(async (_url: string, init: RequestInit = {}) => {
      bodies.push(init.method === 'POST' ? String(init.body) : null);
      return Response.json({ ok: true, version: 3, items: [], registros: { Movimientos: [], Fijos: [], Cuenta: [] }, ahora: Date.now() });
    });
    vi.stubGlobal('fetch', v3);
    const id = addEntry({ ...cine, shared: true });
    await syncShare();
    expect(getState().share?.scriptVersion).toBe(3);
    expect(getState().planPending).toEqual([id]);
    await syncShare();
    // Ya sabe que la hoja no los entiende: no los manda en cada vuelta
    expect(bodies.at(-1)).toBeNull();

    const g = fakeGoogle();
    vi.stubGlobal('fetch', g.fetchImpl);
    await syncShare();
    expect(getState().share?.scriptVersion).toBe(4);
    expect(getState().planPending).toEqual([]);
    expect(g.sheets.Planes.map((r) => r[0])).toEqual(['id', id]);
  });

  it('lo que apunta uno le aparece al otro', async () => {
    const g = fakeGoogle();
    vi.stubGlobal('fetch', g.fetchImpl);
    addEntry({ ...cine, shared: true });
    await syncShare();
    fresh({ settings: { name: 'Javi', onboarded: true, defaultAlert: 15 } as AppState['settings'] });
    await syncShare();
    const got = getState().entries;
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ title: 'Cine', shared: true, by: 'Leyre', alert: 30, dirty: true });
    expect(partnerName(getState())).toBe('Leyre');
  });
});
