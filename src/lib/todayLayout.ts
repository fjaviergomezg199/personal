import type { TodaySection } from '../store/types';

/** Bloques de la pantalla Hoy, en su orden de siempre. */
export const TODAY_SECTIONS: { key: TodaySection; label: string; emoji: string; hint?: string }[] = [
  { key: 'close', label: 'Cerrar el día', emoji: '🌙', hint: 'por la noche' },
  { key: 'dayview', label: 'Día a vista', emoji: '🗓️' },
  { key: 'week', label: 'Resumen de la semana', emoji: '📊', hint: 'domingo y lunes' },
  { key: 'overdue', label: 'De otros días', emoji: '⏰' },
  { key: 'habits', label: 'Hábitos', emoji: '✅' },
  { key: 'menu', label: 'Menú del día', emoji: '🍽️' },
  // Estas tres son tarjetas pequeñas: seguidas, van de dos en dos.
  { key: 'shopping', label: 'Lista de la compra', emoji: '🛒' },
  { key: 'diary', label: 'Calorías de hoy', emoji: '🔥' },
  { key: 'money', label: 'Finanzas', emoji: '💶' },
  { key: 'goals', label: 'Objetivos', emoji: '🎯' },
  { key: 'inbox', label: 'Pendientes', emoji: '📥' },
  { key: 'upcoming', label: 'Próximamente', emoji: '🔜' },
];

/** Lo que se ve en Hoy en modo sencillo. */
export const SIMPLE_SECTIONS: TodaySection[] = ['close', 'dayview', 'week', 'habits', 'shopping'];

/**
 * El orden guardado por la persona, con los bloques nuevos (de versiones
 * posteriores) metidos en su sitio de siempre.
 */
export function resolveLayout(saved: { key: TodaySection; hidden?: boolean }[] | undefined): { key: TodaySection; hidden: boolean }[] {
  const known = new Set(TODAY_SECTIONS.map((s) => s.key));
  const out = (saved ?? []).filter((s, i, all) => known.has(s.key) && all.findIndex((x) => x.key === s.key) === i).map((s) => ({ key: s.key, hidden: !!s.hidden }));
  TODAY_SECTIONS.forEach((s, i) => {
    if (out.some((x) => x.key === s.key)) return;
    // Detrás del bloque que va justo antes en el orden de siempre
    const before = TODAY_SECTIONS.slice(0, i).reverse().find((p) => out.some((x) => x.key === p.key));
    const at = before ? out.findIndex((x) => x.key === before.key) + 1 : 0;
    out.splice(at, 0, { key: s.key, hidden: false });
  });
  return out;
}
