import { describe, expect, it } from 'vitest';
import { normalizeState } from '../store/store';
import type { AppState } from '../store/types';
import { matcher, searchAll, snippet } from './search';

const state = normalizeState({
  version: 5,
  settings: { onboarded: true },
  categories: [{ id: 'c1', name: '2Sigma', color: 'blue', order: 0, createdAt: '' }],
  entries: [
    { id: 'e1', kind: 'reminder', title: 'Comprar entradas Rosalía', date: '2026-10-22', time: '10:00', repeat: 'none', alert: 10, createdAt: '', updatedAt: '' },
    { id: 'e2', kind: 'event', title: 'Clase de Historia', date: '2026-10-21', time: '18:00', categoryId: 'c1', notes: 'Para el examen de Románico repasar las iglesias de peregrinación del Camino.', repeat: 'none', alert: null, createdAt: '', updatedAt: '' },
  ],
  birthdays: [{ id: 'b1', name: 'Marta', day: 22, month: 10, createdAt: '', updatedAt: '' }],
  habits: [{ id: 'h1', name: 'Leer 20 minutos', emoji: '📖', days: [], target: 1, color: 'violet', order: 0, createdAt: '' }],
} as unknown as Partial<AppState>);

describe('buscador', () => {
  it('sin tildes ni mayúsculas, todas las palabras', () => {
    const m = matcher('romanico examen')!;
    expect(m('Para el EXAMEN de Románico')).toBe(true);
    expect(m('Románico')).toBe(false);
    expect(matcher('a')).toBeNull();
  });

  it('encuentra cada cosa en su grupo (también por la categoría y en las notas)', () => {
    const r = searchAll(state, 'románico', '2026-10-21');
    expect(r.map((g) => [g.key, g.hits.map((h) => h.title)])).toEqual([['entries', ['Clase de Historia']]]);
    expect(r[0].hits[0].detail).toContain('Románico');
    expect(r[0].hits[0]).toMatchObject({ color: 'blue', go: { sheet: { type: 'entry', id: 'e2' } } });
    expect(searchAll(state, '2sigma', '2026-10-21')[0].hits.map((h) => h.title)).toEqual(['Clase de Historia']);
    expect(searchAll(state, 'marta', '2026-10-21')[0].hits[0].go).toEqual({ sheet: { type: 'birthday', id: 'b1' } });
    expect(searchAll(state, 'rosalia', '2026-10-21')[0].hits[0].detail).toContain('22 oct');
    expect(searchAll(state, 'leer', '2026-10-21')[0]).toMatchObject({ key: 'habits', hits: [{ title: 'Leer 20 minutos', go: { path: '/habitos' } }] });
  });

  it('trozo de texto alrededor de lo buscado', () => {
    const t = 'Un texto bastante largo donde en algún momento aparece la palabra clave peregrinación y sigue un buen rato más.';
    expect(snippet(t, 'peregrinacion', 40)).toMatch(/^….*peregrinación.*…$/);
  });
});
