import { describe, expect, it } from 'vitest';
import { monthGrid, weekDays } from './calendar';

describe('calendario', () => {
  it('el mes en semanas de lunes a domingo', () => {
    const g = monthGrid('2026-10-28');
    expect(g).toHaveLength(5);
    expect(g[0][0]).toBe('2026-09-28');
    expect(g[0][3]).toBe('2026-10-01');
    expect(g.at(-1)!.at(-1)).toBe('2026-11-01');
    // Un mes que empieza en domingo ocupa 6 semanas
    expect(monthGrid('2026-03-10')).toHaveLength(6);
    expect(weekDays('2026-10-28')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
});
