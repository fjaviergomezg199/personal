import type { SheetRequest } from '../components/sheets';
import type { AppState, ISODate } from '../store/types';
import { formatDayMonth } from './dates';
import { fold } from './quickParse';

export type Target = { sheet: SheetRequest } | { path: string };

export interface Hit {
  key: string;
  emoji: string;
  title: string;
  detail?: string;
  /** Color de su categoría. */
  color?: string;
  /** Para ordenar (lo más reciente o próximo primero). */
  date?: ISODate;
  go: Target;
}

export interface HitGroup {
  key: string;
  label: string;
  hits: Hit[];
}

const norm = (s: string) => fold(s).replace(/\s+/g, ' ');

/** Todas las palabras buscadas tienen que aparecer (sin importar tildes ni mayúsculas). */
export function matcher(query: string): ((...texts: (string | undefined)[]) => boolean) | null {
  const words = norm(query).trim().split(' ').filter((w) => w.length > 0);
  if (!words.length || words.join('').length < 2) return null;
  return (...texts) => {
    const t = norm(texts.filter(Boolean).join(' '));
    return words.every((w) => t.includes(w));
  };
}

/** Un trozo del texto alrededor de lo buscado. */
export function snippet(text: string, query: string, size = 70): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const first = norm(query).trim().split(' ')[0] ?? '';
  const i = first ? norm(t).indexOf(first) : -1;
  if (i < 0 || t.length <= size) return t.length > size ? `${t.slice(0, size)}…` : t;
  const start = Math.max(0, i - Math.floor(size / 3));
  return `${start > 0 ? '…' : ''}${t.slice(start, start + size)}${start + size < t.length ? '…' : ''}`;
}

/** Buscar en el calendario (también por el nombre de la categoría), los cumpleaños y los hábitos. */
export function searchAll(s: AppState, query: string, today: ISODate): HitGroup[] {
  const has = matcher(query);
  if (!has) return [];
  const cats = new Map(s.categories.map((c) => [c.id, c]));
  const groups: HitGroup[] = [];
  const push = (key: string, label: string, hits: Hit[]) => {
    if (!hits.length) return;
    hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    groups.push({ key, label, hits });
  };

  push(
    'entries',
    'Calendario',
    s.entries
      .filter((e) => has(e.title, e.notes, e.location, e.categoryId ? cats.get(e.categoryId)?.name : undefined))
      .map<Hit>((e) => {
        const cat = e.categoryId ? cats.get(e.categoryId) : undefined;
        const notes = e.notes && has(e.notes) && !has(e.title) ? snippet(e.notes, query) : undefined;
        return {
          key: `e${e.id}`,
          emoji: e.kind === 'task' ? '✅' : e.kind === 'event' ? '📅' : '⏰',
          title: e.title,
          detail: [e.date ? formatDayMonth(e.date, today) : 'Sin fecha', e.time, cat?.name, notes].filter(Boolean).join(' · '),
          color: cat?.color,
          date: e.date,
          go: { sheet: { type: 'entry', id: e.id } },
        };
      }),
  );

  push(
    'birthdays',
    'Cumpleaños',
    s.birthdays
      .filter((b) => has(b.name, b.notes))
      .map<Hit>((b) => ({ key: `b${b.id}`, emoji: '🎂', title: `Cumpleaños de ${b.name}`, detail: `${b.day}/${b.month}${b.notes ? ` · ${snippet(b.notes, query, 50)}` : ''}`, go: { sheet: { type: 'birthday', id: b.id } } })),
  );

  push(
    'habits',
    'Hábitos',
    s.habits.filter((h) => has(h.name)).map<Hit>((h) => ({ key: `h${h.id}`, emoji: h.emoji, title: h.name, detail: 'Hábito', go: { path: '/habitos' } })),
  );

  return groups;
}
