import { describe, expect, it } from 'vitest';
import type { Entry, GoogleLink } from '../store/types';
import { mergePlans, planOutbox, type PlanState } from './planSync';
import { exchange } from './shareSync';
import { fakeGoogle } from './testing/fakeGoogle';

const at = (min: number) => new Date(Date.UTC(2026, 9, 21, 8, min)).toISOString();

const plan = (p: Partial<Entry>): Entry => ({
  id: 'E1',
  kind: 'event',
  title: 'Cena con Ana y Luis',
  date: '2026-10-24',
  time: '21:30',
  repeat: 'none',
  alert: 60,
  shared: true,
  by: 'Leyre',
  createdAt: at(0),
  updatedAt: at(0),
  ...p,
});

interface Phone extends PlanState {
  googleDeletes: GoogleLink[];
}
const phone = (entries: Entry[] = [], pending: string[] = []): Phone => ({ entries, pending, gone: [], googleDeletes: [] });

/** Una vuelta de sincronización de los planes, como hace la app. */
async function sync(g: ReturnType<typeof fakeGoogle>, p: Phone, full = true): Promise<Phone> {
  const out = planOutbox(p, 'yo');
  const server = await exchange(g.share, [], out.rows.length ? { Planes: out.rows } : {}, 0, g.fetchImpl);
  const m = mergePlans(p, out.sent, server.registros!.Planes ?? [], full, 15);
  return { entries: m.entries, pending: m.pending, gone: m.gone, googleDeletes: [...p.googleDeletes, ...m.googleDeletes] };
}

const edit = (p: Phone, id: string, patch: Partial<Entry>, min: number): Phone => ({
  ...p,
  entries: p.entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: at(min) } : e)),
  pending: [...new Set([...p.pending, id])],
});

const javiLink: GoogleLink = { id: 'gJavi', calendarId: 'primary' };

describe('planes en pareja', () => {
  it('llega al otro móvil con el aviso de quien lo crea; el área y Google Calendar son de cada uno', async () => {
    const g = fakeGoogle();
    const leyre = phone([plan({ areaId: 'ocio', google: { id: 'gLeyre', calendarId: 'primary' } }), plan({ id: 'E2', title: 'Dentista', shared: false })], ['E1']);
    const a = await sync(g, leyre);
    expect(a.pending).toEqual([]);
    // Una fila legible por plan; lo que no es en pareja no sale del móvil
    expect(g.sheets.Planes).toHaveLength(2);
    expect(g.sheets.Planes[1].slice(0, 5)).toEqual(['E1', 'event', 'Cena con Ana y Luis', '2026-10-24', '21:30']);

    const javi = await sync(g, phone());
    expect(javi.entries).toHaveLength(1);
    expect(javi.entries[0]).toMatchObject({ id: 'E1', title: 'Cena con Ana y Luis', date: '2026-10-24', time: '21:30', alert: 60, shared: true, by: 'Leyre', dirty: true });
    // Va a su propio Google Calendar
    expect(javi.entries[0].google).toBeUndefined();
    expect(javi.entries[0].areaId).toBeUndefined();
  });

  it('los cambios van y vienen; cada uno conserva su aviso y su área', async () => {
    const g = fakeGoogle();
    let leyre = await sync(g, phone([plan({ areaId: 'ocio', google: { id: 'gLeyre', calendarId: 'primary' } })], ['E1']));
    let javi = await sync(g, phone());
    // Javi se pone su aviso y lo mete en su área (solo suyo) y retrasa la cena (de los dos)
    javi = edit(javi, 'E1', { alert: 1440, areaId: 'casa', time: '22:00', location: 'La Tagliatella', by: 'Javi', google: javiLink }, 5);
    javi = await sync(g, javi);
    leyre = await sync(g, { ...leyre, entries: leyre.entries.map((e) => ({ ...e, dirty: false })) });
    expect(leyre.entries[0]).toMatchObject({ time: '22:00', location: 'La Tagliatella', by: 'Javi', alert: 60, areaId: 'ocio', dirty: true });
    expect(leyre.entries[0].google).toEqual({ id: 'gLeyre', calendarId: 'primary' });
    expect(javi.entries[0]).toMatchObject({ alert: 1440, areaId: 'casa' });
  });

  it('si deja de tener hora, el aviso se ajusta', async () => {
    const g = fakeGoogle();
    await sync(g, phone([plan({})], ['E1']));
    let javi = await sync(g, phone());
    expect(javi.entries[0].alert).toBe(60);
    let leyre = phone([plan({ time: undefined, alert: 900, updatedAt: at(9) })], ['E1']);
    leyre = await sync(g, leyre);
    javi = await sync(g, javi);
    expect(javi.entries[0]).toMatchObject({ time: undefined, alert: 900 });
  });

  it('borrarlo en un móvil lo borra en el otro, también de su Google Calendar', async () => {
    const g = fakeGoogle();
    let leyre = await sync(g, phone([plan({})], ['E1']));
    let javi = await sync(g, phone());
    javi = { ...javi, entries: javi.entries.map((e) => ({ ...e, google: javiLink, dirty: false })) };
    leyre = { ...leyre, entries: [], gone: [{ id: 'E1', at: Date.parse(at(10)) }], pending: ['E1'] };
    leyre = await sync(g, leyre);
    expect(leyre.gone).toEqual([]);
    expect(leyre.pending).toEqual([]);
    javi = await sync(g, javi);
    expect(javi.entries).toEqual([]);
    expect(javi.googleDeletes).toEqual([javiLink]);
  });

  it('dejar de compartirlo: el otro deja de verlo y tú lo conservas', async () => {
    const g = fakeGoogle();
    let leyre = await sync(g, phone([plan({})], ['E1']));
    let javi = await sync(g, phone());
    leyre = edit(leyre, 'E1', { shared: false }, 12);
    leyre = await sync(g, leyre);
    javi = await sync(g, javi);
    expect(javi.entries).toEqual([]);
    leyre = await sync(g, leyre);
    expect(leyre.entries).toHaveLength(1);
    expect(leyre.entries[0].shared).toBe(false);
  });

  it('si los dos cambian lo mismo, gana el último', async () => {
    const g = fakeGoogle();
    let leyre = await sync(g, phone([plan({})], ['E1']));
    let javi = await sync(g, phone());
    leyre = edit(leyre, 'E1', { time: '21:00' }, 20);
    javi = edit(javi, 'E1', { time: '20:45' }, 25);
    javi = await sync(g, javi);
    leyre = await sync(g, leyre); // el de Leyre es anterior: la hoja se queda con el de Javi
    expect(leyre.entries[0].time).toBe('20:45');
    expect(leyre.pending).toEqual([]);
  });

  it('si uno lo borra y el otro lo cambia después, vuelve', async () => {
    const g = fakeGoogle();
    let leyre = await sync(g, phone([plan({})], ['E1']));
    let javi = await sync(g, phone());
    leyre = { ...leyre, entries: [], gone: [{ id: 'E1', at: Date.parse(at(30)) }], pending: ['E1'] };
    javi = edit(javi, 'E1', { title: 'Cena con Ana, Luis y Marta' }, 35);
    javi = await sync(g, javi);
    leyre = await sync(g, leyre);
    expect(leyre.entries.map((e) => e.title)).toEqual(['Cena con Ana, Luis y Marta']);
    expect(leyre.gone).toEqual([]);
  });

  it('una tarea hecha está hecha para los dos (también los días de una repetida)', async () => {
    const g = fakeGoogle();
    const tasks = [
      plan({ id: 'T1', kind: 'task', title: 'Comprar el regalo de mamá', date: undefined, time: undefined, alert: null }),
      plan({ id: 'T2', kind: 'reminder', title: 'Sacar la basura', date: '2026-10-19', time: '21:00', repeat: 'weekly', alert: 0 }),
    ];
    let leyre = await sync(g, phone(tasks, ['T1', 'T2']));
    let javi = await sync(g, phone());
    expect(javi.entries.map((e) => [e.id, e.kind, e.date, e.repeat])).toEqual([
      ['T1', 'task', undefined, 'none'],
      ['T2', 'reminder', '2026-10-19', 'weekly'],
    ]);
    javi = edit(javi, 'T1', { done: true }, 40);
    javi = edit(javi, 'T2', { doneDates: ['2026-10-19'] }, 40);
    javi = await sync(g, javi);
    leyre = await sync(g, leyre);
    expect(leyre.entries.find((e) => e.id === 'T1')?.done).toBe(true);
    expect(leyre.entries.find((e) => e.id === 'T2')?.doneDates).toEqual(['2026-10-19']);
  });

  it('lo que cambia aquí mientras se envía sigue pendiente', async () => {
    const g = fakeGoogle();
    const p = phone([plan({})], ['E1']);
    const out = planOutbox(p, 'yo');
    const server = await exchange(g.share, [], { Planes: out.rows }, 0, g.fetchImpl);
    const now = { ...p, entries: [{ ...p.entries[0], title: 'Cena (cambiada)', updatedAt: at(50) }] };
    const m = mergePlans(now, out.sent, server.registros!.Planes!, true, 15);
    expect(m.pending).toEqual(['E1']);
    expect(m.entries[0].title).toBe('Cena (cambiada)');
  });

  it('en la vuelta completa, lo que ya no está en la hoja desaparece (salvo lo pendiente)', async () => {
    const g = fakeGoogle();
    const p = phone([plan({ id: 'Old' }), plan({ id: 'New', title: 'Nuevo' }), plan({ id: 'Mine', shared: false })], ['New']);
    const r = await sync(g, p);
    expect(r.entries.map((e) => e.id)).toEqual(['New', 'Mine']);
    // Pidiendo solo lo nuevo no se puede saber: no se quita nada
    const inc = await sync(g, phone([plan({ id: 'Old' })]), false);
    expect(inc.entries.map((e) => e.id)).toEqual(['Old', 'New']);
  });

  it('textos que parecen fórmulas llegan tal cual', async () => {
    const g = fakeGoogle();
    await sync(g, phone([plan({ title: '=IMPORTXML("x")', notes: '+34 600 000 000', url: 'https://entradas.example/?a=1' })], ['E1']));
    const javi = await sync(g, phone());
    expect(javi.entries[0]).toMatchObject({ title: '=IMPORTXML("x")', notes: '+34 600 000 000', url: 'https://entradas.example/?a=1' });
  });
});
