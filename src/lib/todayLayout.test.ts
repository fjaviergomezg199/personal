import { describe, expect, it } from 'vitest';
import { resolveLayout, TODAY_SECTIONS } from './todayLayout';

describe('orden de la pantalla Hoy', () => {
  it('sin nada guardado, el de siempre', () => {
    expect(resolveLayout(undefined).map((s) => s.key)).toEqual(TODAY_SECTIONS.map((s) => s.key));
  });

  it('respeta el orden y lo oculto, y mete lo nuevo en su sitio', () => {
    const r = resolveLayout([
      { key: 'money' },
      { key: 'dayview' },
      { key: 'shopping', hidden: true },
      { key: 'goals' },
      { key: 'money' }, // repetido
      { key: 'nada' as never },
    ]);
    expect(r.slice(0, 4)).toEqual([
      { key: 'money', hidden: false },
      { key: 'dayview', hidden: false },
      { key: 'shopping', hidden: true },
      { key: 'overdue', hidden: false }, // nuevo: detrás de «Lista de la compra», como siempre
    ]);
    expect(r).toHaveLength(TODAY_SECTIONS.length);
  });
});
