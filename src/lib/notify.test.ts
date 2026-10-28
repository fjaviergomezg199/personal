import { describe, expect, it } from 'vitest';
import { normalizeState } from '../store/store';
import type { Entry } from '../store/types';
import { dueAlerts } from './notify';

const e = (p: Partial<Entry>): Entry => ({
  id: 'a', kind: 'reminder', title: 'Entradas', date: '2026-10-23', time: '10:00', repeat: 'none', alert: 10, createdAt: '', updatedAt: '', ...p,
});

describe('dueAlerts', () => {
  const state = normalizeState({
    categories: [{ id: 'c1', name: 'Conciertos', color: 'pink', emoji: '🎟️', order: 0, createdAt: '' }],
    entries: [
      e({ categoryId: 'c1' }),
      e({ id: 'done', done: true }),
      e({ id: 'sync', google: { id: 'g', calendarId: 'primary' }, dirty: false }),
      e({ id: 'weekly', title: 'Reunión', date: '2026-10-19', time: '09:00', repeat: 'weekly', alert: 0 }),
    ],
    birthdays: [{ id: 'b', name: 'Marta', day: 24, month: 10, createdAt: '', updatedAt: '' }],
  });
  state.settings.google.clientId = 'x.apps.googleusercontent.com';

  it('avisa a su hora y no repite lo hecho ni lo que avisa Google', () => {
    const due = dueAlerts(state, new Date(2026, 9, 23, 9, 51)).filter((d) => d.key.startsWith('e:'));
    expect(due.map((d) => d.key)).toEqual(['e:a:2026-10-23']);
    expect(due[0].title).toBe('🎟️ Entradas');
  });

  it('nada antes de tiempo', () => {
    expect(dueAlerts(state, new Date(2026, 9, 23, 9, 49)).filter((d) => d.key.startsWith('e:a'))).toEqual([]);
  });

  it('repetidos y cumpleaños (el día antes a las 9:00)', () => {
    const due = dueAlerts(state, new Date(2026, 9, 26, 9, 0));
    expect(due.map((d) => d.key)).toContain('e:weekly:2026-10-26');
    const bday = dueAlerts(state, new Date(2026, 9, 23, 9, 1));
    expect(bday.map((d) => d.key)).toContain('b:b:2026-10-24');
  });

  it('no repite un aviso ya mostrado', () => {
    const s = { ...state, notified: { 'e:a:2026-10-23': Date.now() } };
    expect(dueAlerts(s, new Date(2026, 9, 23, 9, 55)).map((d) => d.key)).not.toContain('e:a:2026-10-23');
  });
});
