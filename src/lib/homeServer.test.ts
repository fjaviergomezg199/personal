import { afterEach, describe, expect, it, vi } from 'vitest';
import { addEntry, addListItems, getState, normalizeState, replaceState, setShare } from '../store/store';
import type { AppState } from '../store/types';
import { createHome, fetchSharedItems, formatHomeCode, newHomeCode, pushSharedItems, readHomeCode, ShareError, syncShare } from './shareSync';
import { fakeServer } from './testing/fakeGoogle';

afterEach(() => vi.unstubAllGlobals());

const item = (id: string, text: string, updatedAt = 1) => ({ id, list: 'compra' as const, text, done: false, updatedAt });
const phone = (name: string, extra: Partial<AppState> = {}) => replaceState(normalizeState({ settings: { name, onboarded: true }, ...extra } as Partial<AppState>));

describe('código del hogar', () => {
  it('12 letras y números sin los que se confunden, en grupos de 4', () => {
    const c = newHomeCode();
    expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(newHomeCode()).not.toBe(c);
    expect(formatHomeCode('K7P4QX9MZT2W')).toBe('K7P4-QX9M-ZT2W');
  });

  it('se entiende como se escriba o se pegue', () => {
    expect(readHomeCode('K7P4-QX9M-ZT2W')).toBe('K7P4QX9MZT2W');
    expect(readHomeCode('k7p4 qx9m zt2w')).toBe('K7P4QX9MZT2W');
    expect(readHomeCode(' k7p4qx9mzt2w ')).toBe('K7P4QX9MZT2W');
    // La O por el 0 y la I o la L por el 1
    expect(readHomeCode('K7P4-QX9M-ZTOI')).toBe('K7P4QX9MZT01');
    expect(readHomeCode('Únete a nuestro hogar en Día a Día 🏠\n3. Escribe: K7P4-QX9M-ZT2W\nhttps://x.github.io/personal/')).toBe('K7P4QX9MZT2W');
    expect(readHomeCode('K7P4-QX9M')).toBeNull();
    expect(readHomeCode('K7P4-QX9M-ZT2U')).toBeNull();
    expect(readHomeCode('DD1.eyJ1IjoiaHR0cHM6Ly9zY3JpcHQ')).toBeNull();
  });
});

describe('servidor de hogares', () => {
  it('cada hogar tiene su hoja y solo se entra con su código (que el servidor no guarda)', async () => {
    const s = fakeServer();
    const a = { url: s.url, key: 'K7P4QX9MZT2W', central: true };
    const b = { url: s.url, key: 'ABCD1234EFGH', central: true };
    await createHome(a, 'Javi', s.fetchImpl);
    await createHome(b, '', s.fetchImpl);
    expect([...s.books.values()].map((x) => x.title)).toEqual([expect.stringMatching(/^Día a Día · Hogar de Javi · \d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^Día a Día · Hogar · /)]);
    expect([...s.props.entries()].flat().join(' ')).not.toContain(a.key);

    await pushSharedItems(a, [item('1', 'Leche')], s.fetchImpl);
    await pushSharedItems(b, [item('2', 'Pan')], s.fetchImpl);
    expect((await fetchSharedItems(a, s.fetchImpl)).map((i) => i.text)).toEqual(['Leche']);
    expect((await fetchSharedItems(b, s.fetchImpl)).map((i) => i.text)).toEqual(['Pan']);
    expect(s.books.get('libro1')!.sheets.Lista.map((r) => r[2])).toEqual(['texto', 'Leche']);

    // Un código que no existe (o mal escrito) no entra, y no se crea nada
    const wrong = fetchSharedItems({ ...a, key: 'K7P4QX9MZT2X' }, s.fetchImpl);
    await expect(wrong).rejects.toMatchObject({ code: 'key', message: expect.stringContaining('Vuelve a unirte') });
    await expect(fetchSharedItems({ ...a, key: 'nada' }, s.fetchImpl)).rejects.toBeInstanceOf(ShareError);
    expect(s.books.size).toBe(2);
  });

  it('crear otra vez con el mismo código usa el mismo hogar (si se cortó la conexión)', async () => {
    const s = fakeServer();
    const a = { url: s.url, key: 'K7P4QX9MZT2W' };
    await createHome(a, 'Javi', s.fetchImpl);
    await pushSharedItems({ ...a, central: true }, [item('1', 'Leche')], s.fetchImpl);
    const again = await createHome(a, 'Javi', s.fetchImpl);
    expect(again.items.map((i) => i.text)).toEqual(['Leche']);
    expect(s.books.size).toBe(1);
  });

  it('no deja crear hogares sin parar ni con códigos flojos', async () => {
    const s = fakeServer();
    await expect(createHome({ url: s.url, key: 'abc' }, '', s.fetchImpl)).rejects.toMatchObject({ code: 'server' });
    s.props.set('dia', new Date().toISOString().slice(0, 10));
    s.props.set('nuevos', '40');
    await expect(createHome({ url: s.url, key: newHomeCode() }, '', s.fetchImpl)).rejects.toMatchObject({ message: expect.stringContaining('Prueba mañana') });
    s.props.set('nuevos', '0');
    s.props.set('total', '500');
    await expect(createHome({ url: s.url, key: newHomeCode() }, '', s.fetchImpl)).rejects.toMatchObject({ message: expect.stringContaining('no admite más hogares') });
    expect(s.books.size).toBe(0);
  });

  it('dos móviles con el mismo código comparten la compra, la cuenta conjunta y los planes', async () => {
    const s = fakeServer();
    vi.stubGlobal('fetch', s.fetchImpl);
    const home = { url: s.url, key: newHomeCode(), name: 'Hogar', central: true };

    // Javi crea el hogar con lo que ya tenía apuntado
    phone('Javi');
    addListItems('compra', [{ text: 'Leche' }]);
    const cine = addEntry({ kind: 'event', title: 'Cine', date: '2026-10-25', time: '18:00', repeat: 'none', alert: 30, shared: true });
    await createHome(home, 'Javi');
    setShare(home);
    await syncShare();
    expect(getState().share?.error).toBeUndefined();
    expect(getState().listPending).toEqual([]);

    // Leyre se une con el código y lo ve todo; lo suyo también sube
    phone('Leyre');
    addListItems('compra', [{ text: 'Pan' }]);
    setShare(home);
    await syncShare();
    expect(getState().share?.error).toBeUndefined();
    expect(getState().listItems.map((i) => i.text).sort()).toEqual(['Leche', 'Pan']);
    expect(getState().entries.find((e) => e.id === cine)?.title).toBe('Cine');
    expect(s.books.get('libro1')!.sheets.Lista.slice(1).map((r) => r[2]).sort()).toEqual(['Leche', 'Pan']);
  });
});
