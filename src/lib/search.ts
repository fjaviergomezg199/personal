import type { SheetRequest } from '../components/sheets';
import type { AppState, ISODate } from '../store/types';
import { formatDayMonth, localDay } from './dates';
import { categoryOf, eur } from './finance';
import { fold } from './quickParse';

export type Target = { sheet: SheetRequest } | { path: string };

export interface Hit {
  key: string;
  emoji: string;
  title: string;
  detail?: string;
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

/** Buscar en todo: agenda, cumpleaños, planes, notas, documentos, listas, dinero, comidas y hábitos. */
export function searchAll(s: AppState, query: string, today: ISODate): HitGroup[] {
  const has = matcher(query);
  if (!has) return [];
  const areas = new Map(s.areas.map((a) => [a.id, a]));
  const areaWith = (m: string) => s.areas.find((a) => a.modules.includes(m as never));
  const when = (d?: ISODate) => (d ? formatDayMonth(d, today) : undefined);
  const groups: HitGroup[] = [];
  const push = (key: string, label: string, hits: Hit[]) => {
    if (!hits.length) return;
    hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    groups.push({ key, label, hits });
  };

  push(
    'agenda',
    'Agenda y pendientes',
    [
      ...s.entries
        .filter((e) => has(e.title, e.notes, e.location))
        .map<Hit>((e) => ({
          key: `e${e.id}`,
          emoji: e.kind === 'task' ? '✅' : e.kind === 'event' ? '📅' : '⏰',
          title: e.title,
          detail: [when(e.date), e.time, e.areaId ? areas.get(e.areaId)?.name : undefined, e.notes && has(e.notes) ? snippet(e.notes, query) : undefined].filter(Boolean).join(' · '),
          date: e.date,
          go: { sheet: { type: 'entry', id: e.id } },
        })),
      ...s.googleEvents
        .filter((g) => has(g.title, g.location))
        .map<Hit>((g) => ({ key: `g${g.id}`, emoji: '📅', title: g.title, detail: [when(g.date), g.time, 'Google Calendar'].filter(Boolean).join(' · '), date: g.date, go: { sheet: { type: 'google', event: g } } })),
    ],
  );

  push(
    'birthdays',
    'Cumpleaños',
    s.birthdays
      .filter((b) => has(b.name, b.notes))
      .map<Hit>((b) => ({ key: `b${b.id}`, emoji: '🎂', title: b.name, detail: `${b.day}/${b.month}${b.notes ? ` · ${snippet(b.notes, query, 50)}` : ''}`, go: { sheet: { type: 'birthday', id: b.id } } })),
  );

  push(
    'plan',
    'Planes y sesiones',
    s.plan
      .filter((p) => has(p.title, p.details, p.result))
      .map<Hit>((p) => {
        const a = areas.get(p.areaId);
        return { key: `p${p.id}`, emoji: a?.emoji ?? '🗓️', title: p.title, detail: [when(p.date), a?.name, p.result].filter(Boolean).join(' · '), date: p.date, go: { sheet: { type: 'plan', id: p.id } } };
      }),
  );

  push(
    'areas',
    'Áreas, notas y objetivos',
    [
      ...s.areas.filter((a) => has(a.name)).map<Hit>((a) => ({ key: `a${a.id}`, emoji: a.emoji, title: a.name, detail: 'Área', go: { path: `/areas/${a.id}` } })),
      ...s.areas
        .filter((a) => a.notes && has(a.notes))
        .map<Hit>((a) => ({ key: `n${a.id}`, emoji: '📝', title: `Notas de ${a.name}`, detail: snippet(a.notes!, query), go: { path: `/areas/${a.id}?bloque=notes` } })),
      ...s.goals
        .filter((g) => !g.archived && has(g.title))
        .map<Hit>((g) => ({ key: `o${g.id}`, emoji: '🎯', title: g.title, detail: g.areaId ? areas.get(g.areaId)?.name : 'Objetivo', go: { path: g.areaId ? `/areas/${g.areaId}?bloque=goals` : '/hoy' } })),
    ],
  );

  push(
    'docs',
    'Documentos',
    s.docs
      .filter((d) => has(d.title, d.text, d.fileName))
      .map<Hit>((d) => ({
        key: `d${d.id}`,
        emoji: d.type === 'pdf' ? '📄' : d.type === 'link' ? '🔗' : d.type === 'image' ? '🖼️' : '📎',
        title: d.title,
        detail: [areas.get(d.areaId)?.name, d.text && has(d.text) ? snippet(d.text, query) : undefined].filter(Boolean).join(' · '),
        date: localDay(d.createdAt),
        go: { path: `/areas/${d.areaId}?bloque=docs` },
      })),
  );

  const shop = areaWith('shopping');
  const chores = areaWith('chores') ?? shop;
  push(
    'lists',
    'Compra y casa',
    s.listItems
      .filter((i) => !i.deleted && has(i.text, i.qty))
      .map<Hit>((i) => ({
        key: `l${i.id}`,
        emoji: i.list === 'compra' ? '🛒' : '🧹',
        title: i.text + (i.qty ? ` (${i.qty})` : ''),
        detail: `${i.list === 'compra' ? 'Lista de la compra' : 'Tareas de casa'}${i.done ? ' · hecho' : ''}`,
        go: { path: i.list === 'compra' && shop ? `/areas/${shop.id}?bloque=shopping` : chores ? `/areas/${chores.id}?bloque=chores` : '/areas' },
      })),
  );

  push(
    'money',
    'Dinero',
    [
      ...s.finance.movements
        .filter((m) => !m.deleted && has(m.note, categoryOf(m.category).label))
        .map<Hit>((m) => ({
          key: `m${m.id}`,
          emoji: categoryOf(m.category).emoji,
          title: m.note || categoryOf(m.category).label,
          detail: [when(m.date), `${m.kind === 'ingreso' ? '+' : '−'}${eur(m.amount)}`, m.scope === 'hogar' ? 'cuenta conjunta' : undefined].filter(Boolean).join(' · '),
          date: m.date,
          go: { sheet: { type: 'movement', id: m.id } },
        })),
      ...s.finance.recurring
        .filter((r) => !r.deleted && has(r.name))
        .map<Hit>((r) => {
          const a = areaWith(r.scope === 'hogar' ? 'jointMoney' : 'money');
          return { key: `f${r.id}`, emoji: categoryOf(r.category).emoji, title: r.name, detail: `Fijo · ${eur(r.amount)} · día ${r.day}`, go: { path: a ? `/areas/${a.id}?bloque=${r.scope === 'hogar' ? 'jointMoney' : 'money'}` : '/areas' } };
        }),
    ],
  );

  const diary = areaWith('diary');
  push(
    'food',
    'Comidas',
    s.foodLog
      .filter((f) => has(f.name))
      .slice(-60)
      .map<Hit>((f) => ({ key: `c${f.id}`, emoji: '🍽️', title: f.name, detail: [when(f.date), f.meal, `${f.kcal} kcal`].join(' · '), date: f.date, go: { path: diary ? `/areas/${diary.id}?bloque=diary` : '/areas' } })),
  );

  push(
    'habits',
    'Hábitos',
    s.habits.filter((h) => has(h.name)).map<Hit>((h) => ({ key: `h${h.id}`, emoji: h.emoji, title: h.name, detail: 'Hábito', go: { path: '/hoy' } })),
  );

  return groups;
}
