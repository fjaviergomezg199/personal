import { describe, expect, it } from 'vitest';
import type { FinAccount, Movement, Recurring } from '../store/types';
import {
  balanceForecast, budgetLines, currentPeriod, daysLeft, eur, expectedNextStart, guessCategory, moveStart, occurrencesIn, parseAmount,
  payDue, periodsOf, setEnd, summarize, summarizePeriod, withStart,
} from './finance';

const acc = (p: Partial<FinAccount> = {}): FinAccount => ({ periodStarts: [], budgets: {}, stamps: {}, ...p });
const mov = (p: Partial<Movement>): Movement => ({ id: Math.random().toString(36).slice(2), scope: 'personal', kind: 'gasto', date: '2026-10-01', amount: 10, category: 'otros', updatedAt: 1, ...p });
const fixed = (p: Partial<Recurring>): Recurring => ({
  id: 'r1', scope: 'personal', kind: 'gasto', name: 'Hipoteca', amount: 750, category: 'hipoteca', day: 1, every: 1, from: '2026-01-01', active: true, updatedAt: 1, ...p,
});

describe('categorías y dinero', () => {
  it('adivina la categoría por el concepto', () => {
    expect(guessCategory('Mercadona', 'gasto')).toBe('super');
    expect(guessCategory('gasolina Repsol', 'gasto')).toBe('transporte');
    expect(guessCategory('cañas con los del trabajo', 'gasto')).toBe('restaurantes');
    expect(guessCategory('Seguro coche', 'gasto')).toBe('seguros');
    expect(guessCategory('entradas concierto', 'gasto')).toBe('ocio');
    expect(guessCategory('Netflix', 'gasto')).toBe('suscripciones');
    expect(guessCategory('recibo de la luz', 'gasto')).toBe('facturas');
    expect(guessCategory('Nómina octubre', 'ingreso')).toBe('nomina');
    expect(guessCategory('bizum de Leyre', 'ingreso')).toBe('extra');
    expect(guessCategory('algo raro', 'gasto')).toBeUndefined();
    expect(guessCategory('gasolina', 'ingreso')).toBeUndefined();
  });

  it('lee y escribe importes a la española', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('1.240,50 €')).toBe(1240.5);
    expect(parseAmount('1.240')).toBe(1240);
    expect(parseAmount('1240')).toBe(1240);
    expect(parseAmount('3,333')).toBe(3333);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(eur(12.5).replace(/\s/g, ' ')).toBe('12,50 €');
    expect(eur(1240, true).replace(/\s/g, ' ')).toBe('1240 €');
    expect(eur(1240.4, true).replace(/\s/g, ' ')).toBe('1240,40 €');
  });
});

describe('periodos que empiezan al cobrar', () => {
  it('el siguiente cobro se espera el día de cobro del mes siguiente', () => {
    expect(expectedNextStart('2026-09-25', 25)).toBe('2026-10-25');
    // Si se cobró tarde (el 27), el siguiente sigue siendo el 25
    expect(expectedNextStart('2026-09-27', 25)).toBe('2026-10-25');
    // Si se cobró antes (el 23), no salta al 25 del mismo mes
    expect(expectedNextStart('2026-09-23', 25)).toBe('2026-10-25');
    expect(expectedNextStart('2026-01-30', 30)).toBe('2026-02-28');
    expect(expectedNextStart('2026-10-01')).toBe('2026-11-01');
  });

  it('cada periodo va de un cobro al día antes del siguiente', () => {
    const a = acc({ periodStarts: ['2026-08-26', '2026-09-27'], payday: 25 });
    const ps = periodsOf(a, '2026-10-21');
    expect(ps.map((p) => [p.start, p.end, p.estimatedEnd])).toEqual([
      ['2026-08-26', '2026-09-26', '2026-09-26'],
      ['2026-09-27', undefined, '2026-10-24'],
    ]);
    expect(currentPeriod(a, '2026-10-21').start).toBe('2026-09-27');
    expect(daysLeft(currentPeriod(a, '2026-10-21'), '2026-10-21')).toBe(4);
  });

  it('el periodo no se cierra solo: el día de cobro pregunta si ya has cobrado', () => {
    const a = acc({ periodStarts: ['2026-09-25'], payday: 25 });
    expect(payDue(a, '2026-10-24')).toBe(false);
    expect(payDue(a, '2026-10-25')).toBe(true);
    expect(currentPeriod(a, '2026-10-26').start).toBe('2026-09-25'); // sigue hasta que se diga
    expect(daysLeft(currentPeriod(a, '2026-10-26'), '2026-10-26')).toBe(0);
    // Cobra el 27: empieza el nuevo y el anterior acaba el 26
    const b = { ...a, periodStarts: withStart(a.periodStarts, '2026-10-27') };
    expect(periodsOf(b, '2026-10-27').map((p) => [p.start, p.end])).toEqual([
      ['2026-09-25', '2026-10-26'],
      ['2026-10-27', undefined],
    ]);
    expect(payDue(b, '2026-10-27')).toBe(false);
  });

  it('sin configurar, empieza el último día de cobro (o el día 1)', () => {
    expect(currentPeriod(acc(), '2026-10-21').start).toBe('2026-10-01');
    expect(currentPeriod(acc({ payday: 25 }), '2026-10-21').start).toBe('2026-09-25');
    expect(payDue(acc({ payday: 25 }), '2026-11-30')).toBe(false);
  });

  it('periodos virtuales hacia atrás para movimientos antiguos', () => {
    const ps = periodsOf(acc({ periodStarts: ['2026-10-25'], payday: 25 }), '2026-10-30', '2026-08-30');
    expect(ps.map((p) => [p.start, p.end ?? null, !!p.virtual])).toEqual([
      ['2026-08-25', '2026-09-24', true],
      ['2026-09-25', '2026-10-24', true],
      ['2026-10-25', null, false],
    ]);
  });

  it('se pueden cambiar el inicio y el fin a mano', () => {
    const starts = ['2026-08-25', '2026-09-25', '2026-10-27'];
    expect(moveStart(starts, '2026-09-25', '2026-09-26')).toEqual(['2026-08-25', '2026-09-26', '2026-10-27']);
    expect(moveStart(starts, '2026-09-25', '2026-10-30')).toBeNull();
    // Poner fin al periodo actual = el siguiente empieza al día siguiente
    expect(setEnd(['2026-09-25'], '2026-09-25', '2026-10-26')).toEqual(['2026-09-25', '2026-10-27']);
    // Mover el fin de uno pasado mueve el inicio del siguiente
    expect(setEnd(starts, '2026-08-25', '2026-09-23')).toEqual(['2026-08-25', '2026-09-24', '2026-10-27']);
    expect(setEnd(starts, '2026-08-25', '2026-10-30')).toBeNull();
    // Quitar el fin: vuelve a quedar abierto
    expect(setEnd(['2026-09-25', '2026-10-27'], '2026-09-25', undefined)).toEqual(['2026-09-25']);
  });
});

describe('fijos, resumen y objetivos', () => {
  it('los fijos caen en su día, cada uno con su frecuencia', () => {
    const rs = [
      fixed({ id: 'hip', day: 1 }),
      fixed({ id: 'luz', name: 'Luz', amount: 60, category: 'facturas', day: 31, every: 2, from: '2026-08-15' }),
      fixed({ id: 'ibi', name: 'IBI', amount: 400, category: 'impuestos', day: 15, every: 12, from: '2026-10-01' }),
    ];
    const occ = occurrencesIn(rs, [], '2026-09-25', '2026-11-24', '2026-10-21');
    expect(occ.map((o) => [o.recurring.id, o.date, o.charged])).toEqual([
      ['hip', '2026-10-01', true],
      ['ibi', '2026-10-15', true],
      ['luz', '2026-10-31', false], // bimestral desde agosto: 31 ago, 31 oct…
      ['hip', '2026-11-01', false],
    ]);
  });

  it('bimestral: cada dos meses desde el mes de referencia, el último día si el mes es corto', () => {
    const luz = fixed({ id: 'luz', amount: 60, day: 31, every: 2, from: '2026-08-15' });
    const occ = occurrencesIn([luz], [], '2026-08-01', '2027-02-28', '2026-10-21');
    expect(occ.map((o) => o.date)).toEqual(['2026-08-31', '2026-10-31', '2026-12-31', '2027-02-28']);
  });

  it('el cargo real sustituye al previsto y se pueden saltar meses', () => {
    const luz = fixed({ id: 'luz', amount: 60, category: 'facturas', day: 5, skips: ['2026-11'] });
    const real = mov({ id: 'x', date: '2026-10-06', amount: 63.4, category: 'facturas', recurringId: 'luz' });
    const occ = occurrencesIn([luz], [real], '2026-09-25', '2026-12-24', '2026-10-21');
    expect(occ.map((o) => [o.date, o.amount, !!o.movement])).toEqual([
      ['2026-10-05', 63.4, true],
      ['2026-12-05', 60, false],
    ]);
  });

  it('resumen del periodo: gastado, ingresos, pendiente y por categoría', () => {
    const fin = {
      movements: [
        mov({ date: '2026-09-26', amount: 45.5, category: 'super' }),
        mov({ date: '2026-10-02', amount: 30, category: 'ocio' }),
        mov({ date: '2026-10-10', amount: 54.5, category: 'super' }),
        mov({ date: '2026-10-12', amount: 2100, kind: 'ingreso', category: 'nomina' }),
        mov({ date: '2026-09-20', amount: 999, category: 'ocio' }), // de otro periodo
        mov({ date: '2026-10-03', amount: 999, category: 'ocio', scope: 'hogar' }), // de otra cuenta
        mov({ date: '2026-10-04', amount: 999, category: 'ocio', deleted: true }),
      ],
      recurring: [fixed({ id: 'gym', name: 'Gimnasio', amount: 40, category: 'deporte', day: 1 }), fixed({ id: 'net', name: 'Netflix', amount: 13, category: 'suscripciones', day: 22 })],
    };
    const s = summarize(fin, 'personal', '2026-09-25', '2026-10-24', '2026-10-21');
    expect(s.spent).toBe(170); // 45,5 + 30 + 54,5 + 40 (gimnasio, ya cargado)
    expect(s.pending).toBe(13); // Netflix, el 22
    expect(s.income).toBe(2100);
    expect(s.byCategory).toEqual([
      { key: 'super', amount: 100 },
      { key: 'deporte', amount: 40 },
      { key: 'ocio', amount: 30 },
    ]);
    expect(budgetLines(acc({ budgets: { ocio: 150, super: 90, viajes: 0 } }), s)).toEqual([
      { key: 'super', limit: 90, spent: 100 },
      { key: 'ocio', limit: 150, spent: 30 },
    ]);
  });

  it('si aún no se ha cobrado, el periodo sigue contando lo de después del día previsto', () => {
    const a = acc({ periodStarts: ['2026-09-25'], payday: 20 });
    const p = currentPeriod(a, '2026-10-21'); // se esperaba cobrar el 20
    const fin = { movements: [mov({ date: '2026-10-21', amount: 20 }), mov({ date: '2026-10-02', amount: 5 })], recurring: [fixed({ amount: 40, day: 21 })] };
    expect(summarizePeriod(fin, 'personal', p, '2026-10-21')).toMatchObject({ spent: 65, pending: 0 });
  });

  it('previsión del saldo al final del periodo', () => {
    const fin = {
      movements: [mov({ scope: 'hogar', date: '2026-10-18', amount: 100 }), mov({ scope: 'hogar', date: '2026-10-21', amount: 50 })],
      recurring: [fixed({ scope: 'hogar', amount: 750, day: 1 }), fixed({ id: 'com', scope: 'hogar', name: 'Comunidad', amount: 60, day: 23 })],
    };
    const a = acc({ periodStarts: ['2026-09-25'], payday: 25, balance: { amount: 1950, date: '2026-10-20' } });
    const p = currentPeriod(a, '2026-10-21');
    // Hoy: 1950 − 50 (el gasto de hoy; el de antes del saldo ya estaba descontado). Al final: − comunidad 60
    expect(balanceForecast(a, fin, 'hogar', p, '2026-10-21')).toEqual({ now: 1900, end: 1840 });
  });
});
