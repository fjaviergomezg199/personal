import { describe, expect, it } from 'vitest';
import { normalizeState } from '../store/store';
import type { AppState } from '../store/types';
import { matcher, searchAll, snippet } from './search';

const state = normalizeState({
  version: 4,
  settings: { onboarded: true },
  areas: [{ id: 'est', name: 'Estudios', emoji: '📚', color: 'violet', template: 'studies', modules: ['plan', 'notes', 'docs'], showOnToday: true, order: 0, notes: 'Para el examen de Románico repasar las iglesias de peregrinación del Camino.', createdAt: '', updatedAt: '' }],
  entries: [{ id: 'e1', kind: 'reminder', title: 'Comprar entradas Rosalía', date: '2026-10-22', time: '10:00', repeat: 'none', alert: 10, createdAt: '', updatedAt: '' }],
  birthdays: [{ id: 'b1', name: 'Marta', day: 22, month: 10, createdAt: '', updatedAt: '' }],
  plan: [{ id: 'p1', areaId: 'est', date: '2026-10-21', title: 'Tema 3: El Románico', createdAt: '', updatedAt: '' }],
  listItems: [{ id: 'L1', list: 'compra', text: 'Plátanos', done: false, updatedAt: 1 }],
  finance: { movements: [{ id: 'M1', scope: 'personal', kind: 'gasto', date: '2026-10-20', amount: 45.3, category: 'super', note: 'Mercadona', updatedAt: 1 }], recurring: [], accounts: {}, pending: [] },
} as unknown as Partial<AppState>);

describe('buscador', () => {
  it('sin tildes ni mayúsculas, todas las palabras', () => {
    const m = matcher('romanico examen')!;
    expect(m('Para el EXAMEN de Románico')).toBe(true);
    expect(m('Románico')).toBe(false);
    expect(matcher('a')).toBeNull();
  });

  it('encuentra cada cosa en su grupo', () => {
    const r = searchAll(state, 'románico', '2026-10-21');
    expect(r.map((g) => [g.key, g.hits.map((h) => h.title)])).toEqual([
      ['plan', ['Tema 3: El Románico']],
      ['areas', ['Notas de Estudios']],
    ]);
    expect(r[1].hits[0].detail).toContain('Románico');
    expect(searchAll(state, 'mercadona', '2026-10-21')[0].hits[0]).toMatchObject({ title: 'Mercadona', go: { sheet: { type: 'movement', id: 'M1' } } });
    expect(searchAll(state, 'platanos', '2026-10-21')[0].key).toBe('lists');
    expect(searchAll(state, 'marta', '2026-10-21')[0].hits[0].go).toEqual({ sheet: { type: 'birthday', id: 'b1' } });
    expect(searchAll(state, 'rosalia', '2026-10-21')[0].hits[0].detail).toContain('22 oct');
  });

  it('trozo de texto alrededor de lo buscado', () => {
    const t = 'Un texto bastante largo donde en algún momento aparece la palabra clave peregrinación y sigue un buen rato más.';
    expect(snippet(t, 'peregrinacion', 40)).toMatch(/^….*peregrinación.*…$/);
  });
});
