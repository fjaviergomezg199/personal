import { describe, expect, it } from 'vitest';
import type { Habit } from '../store/types';
import { bestStreak, completion, daysLabel, scheduled, streak, streakInfo } from './habits';

const habit = (p: Partial<Habit> = {}): Habit => ({ id: 'h', name: 'Leer', emoji: '📚', days: [], target: 1, color: 'violet', order: 0, createdAt: '2026-10-01T08:00:00Z', ...p });
const log = (...dates: string[]) => Object.fromEntries(dates.map((d) => [d, 1]));

describe('hábitos', () => {
  it('días en que toca', () => {
    const h = habit({ days: [0, 2, 4] }); // L, X, V
    expect(scheduled(h, '2026-10-19')).toBe(true); // lunes
    expect(scheduled(h, '2026-10-20')).toBe(false); // martes
    expect(daysLabel([0, 2, 4])).toBe('L, X y V');
    expect(daysLabel([0, 1, 2, 3, 4])).toBe('De lunes a viernes');
    expect(daysLabel([])).toBe('Todos los días');
    expect(daysLabel([6])).toBe('Los domingos');
  });

  it('la racha no se rompe por lo que aún no has hecho hoy', () => {
    const h = habit();
    const l = log('2026-10-18', '2026-10-19', '2026-10-20');
    expect(streak(h, l, '2026-10-21')).toBe(3); // hoy aún no
    expect(streak(h, { ...l, '2026-10-21': 1 }, '2026-10-21')).toBe(4);
    // El 20 falló (comodín) y el 18 también: el segundo fallo rompe, queda el 19
    expect(streak(h, log('2026-10-16', '2026-10-17', '2026-10-19'), '2026-10-21')).toBe(1);
  });

  it('los días que no toca no cuentan ni rompen', () => {
    const h = habit({ days: [0, 2, 4] });
    // L 12, X 14, V 16, L 19 hechos; hoy es martes 20 (no toca)
    expect(streak(h, log('2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19'), '2026-10-20')).toBe(4);
  });

  it('con objetivo de veces al día', () => {
    const h = habit({ target: 8, name: 'Agua' });
    const l = { '2026-10-19': 8, '2026-10-20': 5, '2026-10-21': 9 };
    expect(streak(h, l, '2026-10-21')).toBe(2); // el 20 (5 de 8) lo salva el comodín
    expect(completion(h, l, '2026-10-19', '2026-10-21')).toEqual({ done: 2, due: 3 });
  });

  it('comodín: un fallo suelto no rompe la racha; dos seguidos sí', () => {
    const h = habit();
    const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`);
    // Del 10 al 19 hecho, ayer (20) no, hoy aún no
    expect(streakInfo(h, log(...days(10, 19)), '2026-10-21')).toEqual({ days: 10, freezes: ['2026-10-20'] });
    // Falla el 16 suelto: sigue
    expect(streak(h, log(...days(10, 15), ...days(17, 21)), '2026-10-21')).toBe(11);
    // Dos fallos seguidos (16 y 17): se rompe
    expect(streak(h, log(...days(10, 15), ...days(18, 21)), '2026-10-21')).toBe(4);
    // Dos fallos sueltos con menos de 7 días entre ellos: el segundo rompe
    expect(streak(h, log(...days(10, 12), ...days(14, 16), ...days(18, 21)), '2026-10-21')).toBe(7);
    // Con 7 días o más entre ellos, los dos se perdonan
    expect(streak(h, log(...days(5, 6), ...days(8, 14), ...days(16, 21)), '2026-10-21')).toBe(15);
  });

  it('comodín en un hábito de una vez por semana: uno cada 7 semanas, no cada dos', () => {
    const h = habit({ days: [0], createdAt: '2026-09-01T08:00:00Z' }); // los lunes
    // Lunes 28/9, 5/10 y 19/10 hechos; el 12 no
    expect(streak(h, log('2026-09-28', '2026-10-05', '2026-10-19'), '2026-10-21')).toBe(3);
    // Fallar cada dos semanas no hace crecer la racha: el segundo fallo la corta
    expect(streak(h, log('2026-09-21', '2026-10-05', '2026-10-19'), '2026-10-21')).toBe(2);
  });

  it('mejor racha y cumplimiento desde que existe', () => {
    const h = habit({ createdAt: '2026-10-10T00:00:00Z' });
    const l = log('2026-10-10', '2026-10-11', '2026-10-12', '2026-10-15', '2026-10-16');
    expect(bestStreak(h, l, '2026-10-21')).toBe(3);
    expect(completion(h, l, '2026-10-01', '2026-10-21')).toEqual({ done: 5, due: 12 });
  });
});
