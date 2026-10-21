import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListItem } from '../store/types';
import { exchange, makeJoinCode, readJoinCode, reconcile, ShareError, syncOnce, type LocalLists } from './shareSync';
import { fakeGoogle } from './testing/fakeGoogle';

const item = (p: Partial<ListItem>): ListItem => ({ id: 'L1', list: 'compra', text: 'Leche', done: false, updatedAt: 1000, ...p });

afterEach(() => vi.useRealTimers());

describe('Apps Script del hogar compartido', () => {
  it('crea la hoja, comprueba la clave y guarda en texto', async () => {
    const g = fakeGoogle();
    await expect(syncOnce({ items: [], pending: [] }, { ...g.share, key: 'mala' }, g.fetchImpl)).rejects.toMatchObject({ code: 'key' });
    const r = await syncOnce({ items: [], pending: [] }, g.share, g.fetchImpl);
    expect(r).toEqual({ items: [], pending: [] });
    expect(g.sheets.Lista[0]).toEqual(['id', 'lista', 'texto', 'cantidad', 'hecho', 'actualizado', 'por', 'borrado']);
    // Todo en formato texto: Sheets no convierte «1/2» en fecha ni «007» en 7
    expect(g.formats).toEqual(['A:D=@', 'G:G=@']);
    // Las demás pestañas se crean cuando hay algo que guardar
    expect(Object.keys(g.sheets)).toEqual(['Lista']);
    const r2 = await exchange(g.share, [], { Movimientos: [{ id: 'M1', fecha: '2026-10-21', actualizado: '5' }] }, 0, g.fetchImpl);
    expect(Object.keys(g.sheets).sort()).toEqual(['Lista', 'Movimientos']);
    expect(g.formats).toEqual(['A:D=@', 'G:G=@', 'A:Z=@']);
    // La app sabe qué entiende la hoja aunque aún no haya nada
    expect(Object.keys(r2.registros!).sort()).toEqual(['Cuenta', 'Fijos', 'Movimientos', 'Planes']);
    expect(r2.version).toBe(4);
  });

  it('dos móviles comparten la lista', async () => {
    const g = fakeGoogle();
    let a: LocalLists = { items: [item({ id: 'La', text: 'Leche', by: 'Leyre' }), item({ id: 'Lb', text: 'Pan', qty: '2' })], pending: ['La', 'Lb'] };
    let b: LocalLists = { items: [], pending: [] };

    a = await syncOnce(a, g.share, g.fetchImpl);
    expect(a.pending).toEqual([]);
    b = await syncOnce(b, g.share, g.fetchImpl);
    expect(b.items.map((i) => [i.text, i.qty, i.by])).toEqual([
      ['Leche', undefined, 'Leyre'],
      ['Pan', '2', undefined],
    ]);

    // B marca la leche como comprada
    b = { items: b.items.map((i) => (i.id === 'La' ? { ...i, done: true, updatedAt: 2000 } : i)), pending: ['La'] };
    b = await syncOnce(b, g.share, g.fetchImpl);
    a = await syncOnce(a, g.share, g.fetchImpl);
    expect(a.items.find((i) => i.id === 'La')?.done).toBe(true);
  });

  it('si los dos cambian lo mismo, gana el último', async () => {
    const g = fakeGoogle();
    let a: LocalLists = { items: [item({ id: 'Lp', text: 'Pan' })], pending: ['Lp'] };
    a = await syncOnce(a, g.share, g.fetchImpl);
    let b = await syncOnce({ items: [], pending: [] }, g.share, g.fetchImpl);

    a = { items: [{ ...a.items[0], text: 'Pan integral', updatedAt: 3000 }], pending: ['Lp'] }; // antes
    b = { items: [{ ...b.items[0], text: 'Pan de centeno', updatedAt: 4000 }], pending: ['Lp'] }; // después
    b = await syncOnce(b, g.share, g.fetchImpl); // B envía primero
    a = await syncOnce(a, g.share, g.fetchImpl); // el de A es más viejo: se rechaza
    expect(a.items[0].text).toBe('Pan de centeno');
    expect(a.pending).toEqual([]);
  });

  it('los borrados llegan al otro móvil y se limpian a los 30 días', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    const g = fakeGoogle();
    let a: LocalLists = { items: [item({ id: 'Lx', text: 'Huevos', updatedAt: Date.now() })], pending: ['Lx'] };
    a = await syncOnce(a, g.share, g.fetchImpl);
    let b = await syncOnce({ items: [], pending: [] }, g.share, g.fetchImpl);
    a = { items: [{ ...a.items[0], deleted: true, updatedAt: Date.now() }], pending: ['Lx'] };
    a = await syncOnce(a, g.share, g.fetchImpl);
    b = await syncOnce(b, g.share, g.fetchImpl);
    expect(b.items[0].deleted).toBe(true);

    vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
    b = { items: [...b.items, item({ id: 'Ly', text: 'Sal', updatedAt: Date.now() })], pending: ['Ly'] };
    b = await syncOnce(b, g.share, g.fetchImpl);
    expect(b.items.map((i) => i.text)).toEqual(['Sal']);
    expect(g.sheets.Lista).toHaveLength(2);
  });

  it('no deja meter fórmulas en la hoja', async () => {
    const g = fakeGoogle();
    const r = await syncOnce({ items: [item({ id: 'Lf', text: '=IMPORTXML("x")', qty: '-1' })], pending: ['Lf'] }, g.share, g.fetchImpl);
    expect(r.items[0]).toMatchObject({ text: '=IMPORTXML("x")', qty: '-1' });
  });

  it('sin conexión o con la hoja mal publicada da un error claro', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(syncOnce({ items: [], pending: [] }, { url: 'u', key: 'k' }, offline)).rejects.toMatchObject({ code: 'offline' });
    const html = vi.fn(async () => new Response('<html>Inicia sesión</html>', { status: 200 }));
    await expect(syncOnce({ items: [], pending: [] }, { url: 'u', key: 'k' }, html)).rejects.toBeInstanceOf(ShareError);
  });
});

describe('hojas de registros (código de la hoja v4)', () => {
  it('guarda tipos de datos nuevos sin cambiar el código, y añade columnas nuevas', async () => {
    const g = fakeGoogle();
    await exchange(g.share, [], { Ideas: [{ id: 'I1', texto: 'Ir a Asturias', actualizado: '10', borrado: 'false' }] } as never, 0, g.fetchImpl);
    expect(g.sheets.Ideas[0]).toEqual(['id', 'texto', 'actualizado', 'borrado', 'recibido']);
    // Una versión posterior de la app manda un dato más
    const r = await exchange(g.share, [], { Ideas: [{ id: 'I2', texto: 'Cena en casa', prioridad: 'alta', actualizado: '20', borrado: 'false' }] } as never, 0, g.fetchImpl);
    expect(g.sheets.Ideas[0]).toEqual(['id', 'texto', 'actualizado', 'borrado', 'recibido', 'prioridad']);
    const ideas = (r.registros as Record<string, Record<string, string>[]>).Ideas;
    expect(ideas.map((i) => [i.id, i.texto, i.prioridad])).toEqual([
      ['I1', 'Ir a Asturias', ''],
      ['I2', 'Cena en casa', 'alta'],
    ]);
  });

  it('no toca la lista ni las pestañas que no son suyas', async () => {
    const g = fakeGoogle();
    g.sheets.Notas = [['Fecha', 'Qué'], ['1/10', 'Mis cosas']];
    await exchange(g.share, [], { Lista: [{ id: 'x', actualizado: '1' }], Notas: [{ id: 'N1', actualizado: '1' }], hola: [{ id: 'h' }] } as never, 0, g.fetchImpl);
    expect(g.sheets.Notas).toEqual([['Fecha', 'Qué'], ['1/10', 'Mis cosas']]);
    // Solo se mira su cabecera, no se lee entera
    expect(g.reads.Notas).toBeUndefined();
    expect(g.sheets.Lista).toEqual([['id', 'lista', 'texto', 'cantidad', 'hecho', 'actualizado', 'por', 'borrado']]);
    expect(Object.keys(g.sheets).sort()).toEqual(['Lista', 'Notas']);
  });
});

describe('fusión', () => {
  it('lo que cambia aquí mientras se envía sigue pendiente', () => {
    const sent = [item({ id: 'L1', updatedAt: 1000 })];
    const current = { items: [item({ id: 'L1', updatedAt: 1500, done: true })], pending: ['L1'] };
    const r = reconcile(current, sent, [item({ id: 'L1', updatedAt: 1000 })]);
    expect(r.pending).toEqual(['L1']);
    expect(r.items[0].done).toBe(true);
  });
});

describe('código para unirse', () => {
  it('ida y vuelta, aunque venga con texto alrededor', () => {
    const share = { url: 'https://script.google.com/macros/s/AKfycbx-123_abc/exec', key: 'k9', name: 'Casa' };
    const code = makeJoinCode(share);
    expect(readJoinCode(`¡Únete! ${code} 😊`)).toEqual(share);
    expect(readJoinCode('DD1.basura')).toBeNull();
    expect(readJoinCode(makeJoinCode({ ...share, url: 'https://evil.example/exec' }))).toBeNull();
  });
});
