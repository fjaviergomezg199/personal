import type { ColorKey } from '../store/types';

/** Los colores de las categorías y los hábitos (en claro y en oscuro, con buen contraste: ver styles.css). */
export const COLORS: { key: ColorKey; label: string }[] = [
  { key: 'violet', label: 'Violeta' },
  { key: 'blue', label: 'Azul' },
  { key: 'teal', label: 'Turquesa' },
  { key: 'green', label: 'Verde' },
  { key: 'amber', label: 'Mostaza' },
  { key: 'orange', label: 'Naranja' },
  { key: 'rose', label: 'Rojo' },
  { key: 'pink', label: 'Rosa' },
  { key: 'slate', label: 'Gris' },
];

export const COLOR_KEYS = COLORS.map((c) => c.key);

export const isColor = (v: unknown): v is ColorKey => typeof v === 'string' && (COLOR_KEYS as string[]).includes(v);

/** El color de Google Calendar más parecido (así lo enviado sale del mismo color allí). */
export const GOOGLE_COLOR_ID: Record<ColorKey, string> = {
  violet: '3',
  blue: '9',
  teal: '7',
  green: '10',
  amber: '5',
  orange: '6',
  rose: '11',
  pink: '4',
  slate: '8',
};

export const EMOJI_CHOICES = [
  '💧', '📖', '🧘', '🏃', '🏋️', '🚴', '🏊', '🥗', '🍎', '😴', '📵', '✍️', '🎸', '🧹', '💊', '🙏',
  '🌿', '☀️', '🦷', '💰', '🧠', '❤️', '🐶', '🎨', '💼', '📚', '🎯', '⭐', '🇬🇧', '🎵', '💻', '🏠',
];
