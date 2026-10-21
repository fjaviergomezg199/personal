import { describe, expect, it } from 'vitest';
import { localDay } from './dates';
import { completion, streak } from './habits';
import type { Habit } from '../store/types';

// En Madrid, las 00:30 del miércoles 21 son las 22:30 (UTC) del martes 20.
process.env.TZ = 'Europe/Madrid';

describe('el día de una marca de tiempo es el de aquí, no el de Greenwich', () => {
  it('pasada la medianoche cuenta el día nuevo', () => {
    expect(localDay('2026-10-20T22:30:00.000Z')).toBe('2026-10-21');
    expect(localDay('2026-10-21T10:00:00.000Z')).toBe('2026-10-21');
  });

  it('un hábito creado a las 00:30 no cuenta el día anterior como fallado', () => {
    const h: Habit = { id: 'h', name: 'Agua', emoji: '💧', days: [], target: 1, color: 'blue', order: 0, createdAt: '2026-10-20T22:30:00.000Z' };
    const log = { '2026-10-21': 1, '2026-10-22': 1 };
    expect(completion(h, log, '2026-10-19', '2026-10-22')).toEqual({ done: 2, due: 2 });
    expect(streak(h, log, '2026-10-22')).toBe(2);
  });
});
