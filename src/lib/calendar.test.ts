import { describe, expect, it } from 'vitest';
import type { AgendaItem } from '../store/selectors';
import type { Entry } from '../store/types';
import { firstVisibleMinute, layoutDay, monthGrid, slotAt, weekDays } from './calendar';

const entry = (id: string, time: string, endTime?: string, kind: Entry['kind'] = 'event'): AgendaItem => ({
  kind: 'entry',
  key: id,
  date: '2026-10-28',
  time,
  done: false,
  entry: { id, kind, title: id, date: '2026-10-28', time, endTime, repeat: 'none', alert: null, createdAt: '', updatedAt: '' },
});

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

  it('lo que se solapa va en columnas; lo que no, a lo ancho', () => {
    const b = layoutDay([entry('a', '10:00', '11:00'), entry('b', '10:30', '12:00'), entry('c', '11:00', '11:30'), entry('d', '13:00'), entry('t', '13:00', undefined, 'task')]);
    const by = Object.fromEntries(b.map((x) => [x.item.key, [x.lane, x.lanes, x.start, x.end]]));
    expect(by).toEqual({
      a: [0, 2, 600, 660],
      b: [1, 2, 630, 720],
      c: [0, 2, 660, 690],
      d: [0, 2, 780, 840],
      t: [1, 2, 780, 810],
    });
  });

  it('lo que no tiene hora no va en la cuadrícula; tocar a una altura da su media hora', () => {
    const allDay: AgendaItem = { kind: 'birthday', key: 'x', date: '2026-10-28', birthday: { id: 'b', name: 'Marta', day: 28, month: 10, createdAt: '', updatedAt: '' } };
    expect(layoutDay([allDay])).toEqual([]);
    expect(slotAt(0, 48)).toBe('00:00');
    expect(slotAt(48 * 7 + 30, 48)).toBe('07:30');
    expect(slotAt(48 * 30, 48)).toBe('23:30');
  });

  it('la parrilla por horas empieza donde se ve lo que queda por delante', () => {
    const day = (date: string, ...items: AgendaItem[]) => ({ date, blocks: layoutDay(items) });
    const span = 12 * 60; // caben 12 horas
    // Una semana que viene con todo por la tarde: baja lo justo para que se vea lo último
    const week = [day('2026-11-02', entry('a', '19:00', '19:45')), day('2026-11-07', entry('b', '09:30', '10:40')), day('2026-11-08', entry('c', '20:00', '21:00'))];
    expect(firstVisibleMinute(week, '2026-10-28', 16 * 60, span)).toBe(9 * 60);
    // Si cabe todo, desde las 7:00
    expect(firstVisibleMinute([day('2026-11-02', entry('a', '09:00', '10:00'))], '2026-10-28', 0, span)).toBe(7 * 60);
    // Algo muy temprano manda
    expect(firstVisibleMinute([day('2026-11-02', entry('a', '05:30', '06:30'))], '2026-10-28', 0, span)).toBe(5 * 60 + 30);
    // Sin nada: a las 7:00
    expect(firstVisibleMinute([day('2026-11-02')], '2026-10-28', 0, span)).toBe(7 * 60);
    // Hoy a las 16:20: se ve la hora de ahora y hasta el final de la cena
    const today = [day('2026-10-28', entry('m', '10:00', '11:00'), entry('n', '21:30', '23:30'))];
    expect(firstVisibleMinute(today, '2026-10-28', 16 * 60 + 20, span)).toBe(11 * 60 + 30);
    // A las 8:00 con todo por delante: desde las 7:00
    expect(firstVisibleMinute(today, '2026-10-28', 8 * 60, span)).toBe(7 * 60);
    // Una semana pasada: todo lo que tenga
    expect(firstVisibleMinute([day('2026-10-19', entry('p', '06:00', '07:00'))], '2026-10-28', 0, span)).toBe(6 * 60);
  });
});
