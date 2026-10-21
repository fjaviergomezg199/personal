export interface CategoryInfo {
  key: string;
  emoji: string;
  label: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { key: 'tickets', emoji: '🎟️', label: 'Entradas' },
  { key: 'concert', emoji: '🎵', label: 'Concierto' },
  { key: 'trip', emoji: '✈️', label: 'Viaje' },
  { key: 'food', emoji: '🍽️', label: 'Comida o cena' },
  { key: 'party', emoji: '🎉', label: 'Celebración' },
  { key: 'culture', emoji: '🎭', label: 'Cultura' },
  { key: 'health', emoji: '🩺', label: 'Salud' },
  { key: 'sport', emoji: '🏃', label: 'Deporte' },
  { key: 'study', emoji: '📚', label: 'Estudios' },
  { key: 'work', emoji: '💼', label: 'Trabajo' },
  { key: 'home', emoji: '🏠', label: 'Casa' },
  { key: 'money', emoji: '💶', label: 'Pagos' },
];

export function categoryInfo(key?: string): CategoryInfo | undefined {
  return key ? CATEGORIES.find((c) => c.key === key) : undefined;
}
