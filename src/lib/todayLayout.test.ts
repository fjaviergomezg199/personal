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
    // Lo que no estaba guardado va detrás del bloque que le precede en el orden de siempre
    expect(r.map((x) => (x.hidden ? `(${x.key})` : x.key))).toEqual([
      'close', // nuevo y el primero de siempre: arriba del todo
      'money',
      'dayview',
      'week',
      'overdue',
      'habits',
      'menu',
      '(shopping)',
      'diary',
      'goals',
      'inbox',
      'upcoming',
    ]);
    expect(r).toHaveLength(TODAY_SECTIONS.length);
  });
});
