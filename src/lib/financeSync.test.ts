import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyFinance } from '../store/store';
import type { FinanceState, Movement, Recurring } from '../store/types';
import { financeOutbox, mergeFinance } from './financeSync';
import { exchange } from './shareSync';
import { fakeGoogle } from './testing/fakeGoogle';

const mov = (p: Partial<Movement>): Movement => ({
  id: 'M1', scope: 'hogar', kind: 'gasto', date: '2026-10-20', amount: 54.3, category: 'super', note: 'Mercadona', updatedAt: 1000, by: 'Leire', ...p,
});
const fixed = (p: Partial<Recurring>): Recurring => ({
  id: 'F1', scope: 'hogar', kind: 'gasto', name: 'Hipoteca', amount: 750, category: 'hipoteca', day: 1, every: 1, from: '2026-09-25', active: true, updatedAt: 1000, ...p,
});

/** Una vuelta de sincronización de la cuenta conjunta, como hace la app. */
async function sync(g: ReturnType<typeof fakeGoogle>, fin: FinanceState, opts: { full?: boolean; since?: number } = {}) {
  const out = financeOutbox(fin, 'yo');
  const server = await exchange(g.share, [], out.records, opts.full === false ? Math.max(0, (opts.since ?? 0) - 120000) : 0, g.fetchImpl);
  expect(server.version).toBe(3);
  const m = mergeFinance(fin, out.sent, server.registros!, opts.full !== false);
  const next: FinanceState = { ...fin, movements: m.movements, recurring: m.recurring, pending: m.pending, accounts: { ...fin.accounts, hogar: m.hogar } };
  return { fin: next, since: server.ahora!, server };
}

afterEach(() => vi.useRealTimers());

describe('cuenta conjunta compartida', () => {
  it('los movimientos, fijos y la configuración llegan al otro móvil', async () => {
    const g = fakeGoogle();
    const leire = emptyFinance();
    leire.movements.push(mov({}), mov({ id: 'P1', scope: 'personal', note: 'Mis cosas' }));
    leire.recurring.push(fixed({}));
    leire.accounts.hogar = { ...leire.accounts.hogar, periodStarts: ['2026-09-25'], payday: 25, budgets: { super: 400 }, stamps: { periods: 900, budgets: 900 } };
    leire.pending = ['m:M1', 'f:F1', 'c:periods', 'c:budgets'];

    const a = await sync(g, leire);
    expect(a.fin.pending).toEqual([]);
    // La hoja se puede leer: una fila por movimiento, en texto
    expect(g.sheets.Movimientos[1].slice(0, 8)).toEqual(['M1', '2026-10-20', '54.3', 'gasto', 'super', 'Mercadona', '', 'Leire']);
    // Lo personal no sale del móvil
    expect(g.sheets.Movimientos).toHaveLength(2);

    const javi = await sync(g, emptyFinance());
    expect(javi.fin.movements).toEqual([{ ...mov({}), deleted: false }]);
    expect(javi.fin.recurring).toEqual([{ ...fixed({}), by: undefined, skips: undefined, deleted: false }]);
    expect(javi.fin.accounts.hogar).toMatchObject({ periodStarts: ['2026-09-25'], payday: 25, budgets: { super: 400 } });
  });

  it('si los dos cambian lo mismo, gana el último', async () => {
    const g = fakeGoogle();
    const base = emptyFinance();
    base.movements.push(mov({}));
    base.pending = ['m:M1'];
    let a = (await sync(g, base)).fin;
    let b = (await sync(g, emptyFinance())).fin;
    a = { ...a, movements: [{ ...a.movements[0], amount: 60, updatedAt: 3000 }], pending: ['m:M1'] };
    b = { ...b, movements: [{ ...b.movements[0], amount: 70, updatedAt: 4000 }], pending: ['m:M1'] };
    b = (await sync(g, b)).fin;
    a = (await sync(g, a)).fin; // el cambio de A es anterior: la hoja se queda con el de B
    expect(a.movements[0].amount).toBe(70);
    expect(a.pending).toEqual([]);
    expect(b.movements[0].amount).toBe(70);
  });

  it('pide solo lo nuevo y no pierde lo que cambia mientras tanto', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    const g = fakeGoogle();
    const a0 = emptyFinance();
    a0.movements.push(mov({ id: 'M1' }), mov({ id: 'M2', amount: 10 }));
    a0.pending = ['m:M1', 'm:M2'];
    await sync(g, a0);
    vi.setSystemTime(new Date('2026-10-21T10:05:00Z'));
    const first = await sync(g, emptyFinance());
    expect(first.fin.movements).toHaveLength(2);

    vi.setSystemTime(new Date('2026-10-21T10:15:00Z'));
    const a1 = emptyFinance();
    a1.movements.push(mov({ id: 'M3', amount: 5, updatedAt: Date.now() }));
    a1.pending = ['m:M3'];
    await sync(g, a1, { full: false, since: first.since });

    const inc = await sync(g, first.fin, { full: false, since: first.since });
    expect(inc.server.registros!.Movimientos!.map((r) => r.id)).toEqual(['M3']); // solo lo nuevo
    expect(inc.fin.movements.map((m) => m.id)).toEqual(['M1', 'M2', 'M3']);
  });

  it('lo borrado llega borrado; a los 30 días desaparece de la hoja y del móvil', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    const g = fakeGoogle();
    const a0 = emptyFinance();
    a0.movements.push(mov({ updatedAt: Date.now() }));
    a0.pending = ['m:M1'];
    let a = (await sync(g, a0)).fin;
    let b = (await sync(g, emptyFinance())).fin;
    a = { ...a, movements: [{ ...a.movements[0], deleted: true, updatedAt: Date.now() + 1 }], pending: ['m:M1'] };
    a = (await sync(g, a)).fin;
    b = (await sync(g, b)).fin;
    expect(b.movements[0].deleted).toBe(true);

    vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
    const c = emptyFinance();
    c.movements.push(mov({ id: 'M9', updatedAt: Date.now() }));
    c.pending = ['m:M9'];
    await sync(g, c); // al escribir, la hoja limpia lo borrado hace más de 30 días
    b = (await sync(g, b)).fin; // y la vuelta completa lo quita del móvil
    expect(b.movements.map((m) => m.id)).toEqual(['M9']);
    expect(g.sheets.Movimientos).toHaveLength(2);
  });

  it('un fijo con meses saltados y textos que parecen fórmulas', async () => {
    const g = fakeGoogle();
    const a = emptyFinance();
    a.recurring.push(fixed({ name: '=HYPERLINK("x")', skips: ['2026-11', '2027-01'], every: 2 }));
    a.movements.push(mov({ note: '+34 600 000 000', recurringId: 'F1' }));
    a.pending = ['f:F1', 'm:M1'];
    await sync(g, a);
    const b = (await sync(g, emptyFinance())).fin;
    expect(b.recurring[0]).toMatchObject({ name: '=HYPERLINK("x")', skips: ['2026-11', '2027-01'], every: 2 });
    expect(b.movements[0]).toMatchObject({ note: '+34 600 000 000', recurringId: 'F1' });
  });

  it('con el código antiguo de la hoja, la cuenta conjunta se queda pendiente', async () => {
    const old = async () => Response.json({ ok: true, items: [], ahora: 1 });
    const r = await exchange({ url: 'u', key: 'k' }, [], { Movimientos: [{ id: 'M1' }] }, 0, old);
    expect(r.version).toBe(2);
    expect(r.registros).toBeUndefined();
  });
});
