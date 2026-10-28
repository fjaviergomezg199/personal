import { describe, expect, it } from 'vitest';
import { birthdayInYear, nextBirthday, nextOccurrence, occurrencesBetween, occursOn } from './recurrence';
import { entryToGoogle, rrule } from './sync';
import { entryToIcs } from './ics';
import type { Entry } from '../store/types';

const base: Entry = {
  id: 'x', kind: 'reminder', title: 'Prueba', date: '2026-10-21', repeat: 'none', alert: 15,
  createdAt: '', updatedAt: '',
};

describe('recurrencias', () => {
  it('semanal y entre semana', () => {
    const weekly = { ...base, repeat: 'weekly' as const };
    expect(occursOn(weekly, '2026-10-28')).toBe(true);
    expect(occursOn(weekly, '2026-10-27')).toBe(false);
    const wd = { ...base, repeat: 'weekdays' as const };
    expect(occurrencesBetween(wd, '2026-10-21', '2026-10-27')).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']);
  });
  it('mensual se salta meses sin ese día', () => {
    const m = { ...base, date: '2026-01-31', repeat: 'monthly' as const };
    expect(nextOccurrence(m, '2026-02-01')).toBe('2026-03-31');
  });
  it('planes de varios días', () => {
    const trip = { ...base, date: '2026-11-01', endDate: '2026-11-03' };
    expect(occurrencesBetween(trip, '2026-10-30', '2026-11-05')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
  it('cumpleaños 29 de febrero', () => {
    expect(birthdayInYear({ day: 29, month: 2 }, 2027)).toBe('2027-02-28');
    expect(nextBirthday({ day: 12, month: 3 }, '2026-10-21')).toBe('2027-03-12');
  });
});

describe('Google y .ics', () => {
  it('RRULE', () => {
    expect(rrule('weekdays')).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']);
    expect(rrule('weekly', '2026-12-31')).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z']);
    expect(rrule('yearly', '2030-01-01', true)).toEqual(['RRULE:FREQ=YEARLY;UNTIL=20300101']);
  });
  it('evento con hora y aviso', () => {
    const g = entryToGoogle({ ...base, time: '10:00' }, { id: 'c1', name: 'Conciertos', color: 'pink', emoji: '🎟️', order: 0, createdAt: '' });
    expect(g.summary).toBe('🎟️ Prueba');
    // Del color de su categoría también en Google Calendar
    expect(g.colorId).toBe('4');
    expect(g.description).toContain('Categoría: Conciertos');
    expect(entryToGoogle({ ...base, time: '10:00' }).colorId).toBeUndefined();
    expect(g.start).toMatchObject({ dateTime: '2026-10-21T10:00:00' });
    expect(g.end).toMatchObject({ dateTime: '2026-10-21T10:30:00' });
    expect(g.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] });
  });
  it('todo el día y hecho → sin aviso', () => {
    const g = entryToGoogle({ ...base, kind: 'task', done: true });
    expect(g.start).toEqual({ date: '2026-10-21' });
    expect(g.end).toEqual({ date: '2026-10-22' });
    expect(g.summary).toBe('✓ ✅ Prueba');
    expect(g.reminders?.overrides).toEqual([]);
  });
  it('.ics con alarma', () => {
    const ics = entryToIcs({ ...base, time: '09:30', notes: 'Llevar DNI, tarjeta' });
    expect(ics).toContain('DTSTART:20261021T093000');
    expect(ics).toContain('DESCRIPTION:Llevar DNI\\, tarjeta');
    expect(ics).toContain('TRIGGER:-PT15M');
  });
});
