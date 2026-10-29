import { describe, expect, it } from 'vitest';
import type { Entry } from '../store/types';
import { movedTo, reschedulePatch } from './reschedule';

const TODAY = '2026-10-29'; // jueves
const e = (extra: Partial<Entry>): Entry => ({ id: 'x', kind: 'task', title: 'Llamar a Fulanito', repeat: 'none', alert: null, createdAt: '', updatedAt: '', ...extra });

describe('pasar a otro día', () => {
  it('lo sin día, al día que se elige', () => {
    expect(reschedulePatch(e({}), '2026-11-02', TODAY, '19:00')).toEqual({ date: '2026-11-02', endDate: undefined });
  });
  it('se queda la hora (y su aviso) en otro día', () => {
    expect(reschedulePatch(e({ kind: 'reminder', date: '2026-10-27', time: '10:00', alert: 15 }), '2026-10-30', TODAY, '19:00')).toEqual({ date: '2026-10-30', endDate: undefined });
  });
  it('para hoy, si su hora ya ha pasado, sin hora ni aviso; si no, con su hora', () => {
    const late = e({ kind: 'reminder', date: '2026-10-27', time: '10:00', endTime: '10:30', alert: 15 });
    expect(reschedulePatch(late, TODAY, TODAY, '19:00')).toEqual({ date: TODAY, endDate: undefined, time: undefined, endTime: undefined, alert: null });
    expect(reschedulePatch(late, TODAY, TODAY, '09:00')).toEqual({ date: TODAY, endDate: undefined });
  });
  it('lo de varios días conserva cuántos dura', () => {
    expect(reschedulePatch(e({ date: '2026-10-23', endDate: '2026-10-25' }), '2026-11-06', TODAY, '19:00')).toEqual({ date: '2026-11-06', endDate: '2026-11-08' });
  });
  it('«Sin día»: se queda en Pendientes, sin día, hora ni aviso', () => {
    expect(reschedulePatch(e({ date: '2026-10-27', time: '10:00', alert: 15 }), undefined, TODAY, '19:00')).toEqual({ date: undefined, endDate: undefined, time: undefined, endTime: undefined, alert: null });
  });
  it('cómo se dice en el aviso', () => {
    expect(movedTo(TODAY, TODAY)).toBe('a hoy');
    expect(movedTo('2026-10-30', TODAY)).toBe('a mañana');
    expect(movedTo('2026-10-31', TODAY)).toBe('al sábado 31');
    expect(movedTo('2026-11-12', TODAY)).toBe('al jue 12 nov');
    expect(movedTo('2027-01-08', TODAY)).toBe('al vie 8 ene de 2027');
  });
});
