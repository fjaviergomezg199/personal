import { describe, expect, it } from 'vitest';
import { dayTimeline, layoutBlocks } from './DayView';

const b = (start: number, end: number) => ({ item: { key: `${start}` } as never, start, end, title: '', label: '', done: false });

describe('layoutBlocks', () => {
  it('pone en columnas lo que se solapa y deja el resto a todo lo ancho', () => {
    const out = layoutBlocks([b(600, 660), b(630, 690), b(640, 700), b(800, 830)]);
    expect(out.map((x) => [x.start, x.col, x.cols])).toEqual([
      [600, 0, 3],
      [630, 1, 3],
      [640, 2, 3],
      [800, 0, 1],
    ]);
  });
  it('reutiliza columnas libres', () => {
    const out = layoutBlocks([b(600, 660), b(610, 640), b(645, 700)]);
    expect(out.map((x) => [x.start, x.col, x.cols])).toEqual([
      [600, 0, 2],
      [610, 1, 2],
      [645, 1, 2],
    ]);
  });
});

describe('día en lista: ahora y después', () => {
  const entry = (id: string, time: string, p: Record<string, unknown> = {}) =>
    ({ kind: 'entry', key: id, date: '2026-10-21', time, done: !!p.done, entry: { id, kind: p.kind ?? 'reminder', title: id, time, endTime: p.endTime, repeat: 'none', alert: null } }) as never;

  it('lo que ya terminó se recoge; lo pendiente se queda aunque haya pasado su hora', () => {
    const items = [
      entry('Dentista', '10:00', { kind: 'event', endTime: '11:00' }),
      entry('Llamar al banco', '13:00'),
      entry('Pastilla', '14:00', { done: true }),
      entry('Rodaje', '19:00'),
      entry('Cena', '21:30', { kind: 'event' }),
    ];
    const r = dayTimeline(items, 16 * 60 + 20);
    expect(r.gone.map((i: { key: string }) => i.key)).toEqual(['Dentista', 'Pastilla']);
    expect(r.rest.map((i: { key: string }) => i.key)).toEqual(['Llamar al banco', 'Rodaje', 'Cena']);
    // La línea de «ahora» va justo antes de lo que aún no ha empezado
    expect(r.nowAt).toBe(1);
  });

  it('mañana no hay «ahora» ni nada recogido; si todo pasó, la línea va al final', () => {
    const items = [entry('Clase', '10:00', { kind: 'event' })];
    expect(dayTimeline(items, null)).toMatchObject({ gone: [], nowAt: -1 });
    expect(dayTimeline([entry('Recordatorio', '09:00')], 23 * 60).nowAt).toBe(1);
  });
});
