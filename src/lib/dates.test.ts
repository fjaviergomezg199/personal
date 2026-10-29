import { describe, expect, it } from 'vitest';
import { formatSpan } from './dates';

describe('fechas', () => {
  it('un plan de varios días: «vie 13 – dom 15 nov»', () => {
    expect(formatSpan('2026-11-13', '2026-11-15')).toBe('vie 13 – dom 15 nov');
    expect(formatSpan('2026-11-30', '2026-12-02')).toBe('lun 30 nov – mié 2 dic');
    expect(formatSpan('2026-12-30', '2027-01-02')).toBe('mié 30 dic 2026 – sáb 2 ene 2027');
  });
});
