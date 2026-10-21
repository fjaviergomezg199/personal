import { describe, expect, it } from 'vitest';
import { layoutBlocks } from './DayView';

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
