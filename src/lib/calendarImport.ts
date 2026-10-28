import type { EntryKind, HHMM, ISODate } from '../store/types';
import { addDays, addMinutesToTime, isISODate, makeHHMM, makeISODate, startOfWeek } from './dates';
import { fold } from './quickParse';

/*
 * Importar al calendario: un JSON (o una lista de texto, o una tabla) con lo que
 * toca cada día — un plan de running, de estudio, el calendario de algo… — se
 * convierte en planes y tareas del calendario. Entiende fechas reales, «Día 3»,
 * «Semana 2 martes», nombres de los días y las claves en español o en inglés.
 */

/* ------------------------------------------------------------------ */
/* Utilidades                                                           */
/* ------------------------------------------------------------------ */

const WEEKDAY_NAMES: Record<string, number> = {
  lunes: 0, lun: 0, l: 0, martes: 1, mar: 1, m: 1, miercoles: 2, mie: 2, mier: 2, x: 2, jueves: 3, jue: 3, j: 3,
  viernes: 4, vie: 4, v: 4, sabado: 5, sab: 5, s: 5, domingo: 6, dom: 6, d: 6,
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};
const WD_LONG = '(lunes|martes|miercoles|jueves|viernes|sabado|domingo)';
const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6,
  julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sep: 9, sept: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};
const MONTH_RE = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)';

/** Quita viñetas, almohadillas, negritas... de una línea de Markdown. */
export function stripMarkdown(line: string): string {
  return line
    .replace(/^\s*>+\s?/, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+•·▪◦]|\d{1,3}[.)])\s+/, '')
    .replace(/^\s*\[[ xX]\]\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=\s|$|[,.;:])/g, '$1')
    .trim();
}

/** Extrae el JSON de un texto (con o sin ```json ... ```). */
export function extractJson(text: string): unknown | undefined {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const first = cleaned.search(/[[{]/);
  if (first === -1) return undefined;
  const open = cleaned[first];
  const close = open === '[' ? ']' : '}';
  const last = cleaned.lastIndexOf(close);
  if (last <= first) return undefined;
  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return undefined;
  }
}

const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of Object.keys(o)) {
    if (keys.includes(fold(k).replace(/[\s_-]+/g, ''))) return o[k];
  }
  return undefined;
};

const asText = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.map((x) => asText(x)).filter(Boolean).join('\n');
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${asText(x) ?? ''}`)
      .join('\n');
  }
  const s = String(v).trim();
  return s || undefined;
};

/** Año para un dd/mm sin año: el que deja la fecha más cerca de la referencia. */
function inferDate(day: number, month: number, ref: ISODate): ISODate | undefined {
  const y = Number(ref.slice(0, 4));
  const cands = [y - 1, y, y + 1]
    .map((yy) => makeISODate(yy, month, day))
    .filter((d): d is ISODate => !!d);
  if (!cands.length) return undefined;
  const refT = new Date(ref).getTime();
  // Preferimos fechas futuras o recientes (hasta 2 meses atrás).
  const score = (d: ISODate) => {
    const diff = (new Date(d).getTime() - refT) / 86400000;
    return diff < -60 ? 1000 + Math.abs(diff) : Math.abs(diff);
  };
  return cands.sort((a, b) => score(a) - score(b))[0];
}

function parseTime(s: string): HHMM | undefined {
  const m = /^(\d{1,2})[:.h](\d{2})/.exec(s.trim());
  if (m) return makeHHMM(Number(m[1]), Number(m[2])) ?? undefined;
  const h = /^(\d{1,2})\s*h\b/.exec(s.trim());
  if (h) return makeHHMM(Number(h[1])) ?? undefined;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Planificaciones (running, estudio, cualquier calendario)             */
/* ------------------------------------------------------------------ */

export interface ImportedItem {
  date: ISODate;
  title: string;
  details?: string;
  time?: HHMM;
  endTime?: HHMM;
  /** Nombre de la categoría que trae (se busca o se crea al importar). */
  category?: string;
  kind?: EntryKind;
  location?: string;
}

export interface ImportOptions {
  /** Día 1 / lunes de la semana 1. */
  start: ISODate;
  /** Para deducir el año de "26/10". */
  today: ISODate;
  /** Título por defecto si una sesión no tiene ("Entrenamiento"). */
  defaultTitle?: string;
  /** No convertir la primera línea en título (WODs: se ve el texto completo). */
  keepBody?: boolean;
}

interface DateToken {
  date?: ISODate;
  rest: string;
}

/**
 * Detecta una fecha al principio de la línea: "2026-10-26", "26/10", "Lunes 26/10",
 * "26 de octubre", "Día 3", "Semana 2 lunes", "Lunes".
 */
function leadingDate(raw: string, week: number, weekStart: ISODate, opts: ImportOptions): DateToken | null {
  const f = fold(raw);
  let m: RegExpExecArray | null;
  const after = (len: number) => raw.slice(len);

  if ((m = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(f))) {
    const d = makeISODate(Number(m[1]), Number(m[2]), Number(m[3]));
    return d ? { date: d, rest: after(m[0].length) } : null;
  }
  if ((m = new RegExp(`^(?:${WD_LONG}\\.?,?\\s+)?(?:(?:el|dia)\\s+)?(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?\\b`).exec(f))) {
    const day = Number(m[2]);
    const month = Number(m[3]);
    let d: ISODate | undefined;
    if (m[4]) {
      const y = Number(m[4]) < 100 ? 2000 + Number(m[4]) : Number(m[4]);
      d = makeISODate(y, month, day) ?? undefined;
    } else d = inferDate(day, month, opts.today);
    return d ? { date: d, rest: after(m[0].length) } : null;
  }
  if ((m = new RegExp(`^(?:${WD_LONG}\\.?,?\\s+)?(?:(?:el|dia)\\s+)?(\\d{1,2})(?:\\s+de)?\\s+${MONTH_RE}\\b\\.?(?:(?:\\s+de)?\\s+(\\d{4}))?`).exec(f))) {
    const day = Number(m[2]);
    const month = MONTHS[m[3]];
    const d = m[4] ? (makeISODate(Number(m[4]), month, day) ?? undefined) : inferDate(day, month, opts.today);
    return d ? { date: d, rest: after(m[0].length) } : null;
  }
  if ((m = /^(?:dia|d)\s*(\d{1,3})\b/.exec(f))) {
    return { date: addDays(opts.start, Number(m[1]) - 1), rest: after(m[0].length) };
  }
  if ((m = new RegExp(`^(?:semana|sem|s)\\s*(\\d{1,2})\\s*[,:·-]?\\s*${WD_LONG}\\b`).exec(f))) {
    const w = Number(m[1]);
    const base = addDays(startOfWeek(opts.start), (w - 1) * 7);
    return { date: addDays(base, WEEKDAY_NAMES[m[2]]), rest: after(m[0].length) };
  }
  if ((m = new RegExp(`^${WD_LONG}\\b`).exec(f))) {
    const base = weekStart || addDays(startOfWeek(opts.start), (week - 1) * 7);
    return { date: addDays(base, WEEKDAY_NAMES[m[1]]), rest: after(m[0].length) };
  }
  return null;
}

function splitTitle(rest: string): { title: string; details?: string; time?: HHMM } {
  let r = rest.replace(/^[\s|:.,;–—-]+/, '');
  let time: HHMM | undefined;
  const t = /^(\d{1,2}[:.h]\d{2}|\d{1,2}\s*h\b)\s*h?\s*/.exec(r);
  if (t) {
    time = parseTime(t[1]);
    if (time) r = r.slice(t[0].length).replace(/^[\s|:.,;–—-]+/, '');
  }
  const seps = [' | ', '|', ': ', ' — ', ' – ', ' - '];
  for (const sep of seps) {
    const i = r.indexOf(sep);
    if (i > 0) {
      const title = r.slice(0, i).trim();
      const details = r
        .slice(i + sep.length)
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean)
        .join('\n');
      return { title, details: details || undefined, time };
    }
  }
  return { title: r.trim(), time };
}

const HEADER_ROLE: [RegExp, string][] = [
  [/^(fecha|date)$/, 'date'],
  [/^(dia|day|dia de la semana)$/, 'day'],
  [/^(semana|week|sem)$/, 'week'],
  [/^(hora|time)$/, 'time'],
  [/^(sesion|titulo|actividad|tarea|entreno|entrenamiento|tema|que|session|title|plan|contenido principal)$/, 'title'],
  [/^(detalle|detalles|descripcion|notas|contenido|ejercicios|objetivo|details|description|notes)$/, 'details'],
];

function tableRoles(cells: string[]): string[] | null {
  const roles = cells.map((c) => {
    const f = fold(stripMarkdown(c)).trim();
    return HEADER_ROLE.find(([re]) => re.test(f))?.[1] ?? 'other';
  });
  return roles.filter((r) => r !== 'other').length >= 2 ? roles : null;
}

const LIST_KEYS = ['items', 'eventos', 'events', 'sesiones', 'sessions', 'plan', 'dias', 'days', 'entrenamientos', 'entrenos', 'workouts', 'tareas', 'tasks', 'data', 'planificacion', 'calendario', 'semanas', 'weeks'];
const INNER_KEYS = ['sesiones', 'sessions', 'dias', 'days', 'entrenamientos', 'entrenos', 'workouts', 'items', 'eventos', 'events', 'tareas', 'tasks'];

const KIND_WORDS: [RegExp, EntryKind][] = [
  [/^(evento|plan|cita|event|appointment)$/, 'event'],
  [/^(tarea|task|todo|sesion|entreno|entrenamiento|session|workout)$/, 'task'],
  [/^(recordatorio|aviso|reminder)$/, 'reminder'],
];

/** Lista de elementos, aplanando semanas con sus días ({ semana: 2, dias: [...] }). */
function flatItems(data: unknown): Record<string, unknown>[] | null {
  let arr: unknown = data;
  if (arr && !Array.isArray(arr) && typeof arr === 'object') {
    const o = arr as Record<string, unknown>;
    const inner = pick(o, LIST_KEYS);
    if (Array.isArray(inner)) arr = inner;
    else {
      // { "2026-10-26": "...", ... }
      const keys = Object.keys(o);
      if (keys.length && keys.every((k) => isISODate(k))) {
        arr = keys.map((k) => (typeof o[k] === 'object' && o[k] ? { fecha: k, ...(o[k] as object) } : { fecha: k, titulo: o[k] }));
      }
    }
  }
  if (!Array.isArray(arr)) return null;
  const out: Record<string, unknown>[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const inner = pick(o, INNER_KEYS);
    if (Array.isArray(inner)) {
      // Una semana con sus sesiones: cada una hereda el número de semana (y la categoría)
      const semana = pick(o, ['semana', 'week', 'numero', 'n']);
      const categoria = pick(o, ['categoria', 'category']);
      for (const it of inner) {
        if (it && typeof it === 'object' && !Array.isArray(it)) out.push({ ...(semana !== undefined ? { semana } : {}), ...(categoria !== undefined ? { categoria } : {}), ...(it as object) });
      }
    } else out.push(o);
  }
  return out;
}

function planFromJson(data: unknown, opts: ImportOptions): ImportedItem[] | null {
  const arr = flatItems(data);
  if (!arr) return null;
  const out: ImportedItem[] = [];
  for (const o of arr) {
    let fecha = asText(pick(o, ['fecha', 'date', 'inicio', 'start', 'startdate', 'fechainicio']));
    const diaRaw = pick(o, ['dia', 'day', 'diasemana', 'weekday']);
    const semana = Number(pick(o, ['semana', 'week']) ?? 0);
    // «2026-11-02T18:00» trae también la hora
    let isoTime: HHMM | undefined;
    const dt = fecha ? /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})/.exec(fecha) : null;
    if (dt) {
      fecha = dt[1];
      isoTime = parseTime(dt[2]);
    }
    let date: ISODate | undefined;
    if (fecha) date = leadingDate(fecha, Math.max(semana, 1), '', opts)?.date;
    if (!date && diaRaw !== undefined) {
      if (typeof diaRaw === 'number' || /^\d+$/.test(String(diaRaw))) {
        const n = Number(diaRaw);
        date = semana > 0 && n <= 7 ? addDays(addDays(startOfWeek(opts.start), (semana - 1) * 7), n - 1) : addDays(opts.start, n - 1);
      } else {
        const label = String(diaRaw);
        date = leadingDate(semana > 0 ? `semana ${semana} ${label}` : label, Math.max(semana, 1), '', opts)?.date;
      }
    }
    if (!date) continue;
    const title =
      asText(pick(o, ['titulo', 'title', 'sesion', 'session', 'nombre', 'name', 'tarea', 'actividad', 'entreno', 'tema'])) ??
      opts.defaultTitle ??
      'Sesión';
    const details = asText(pick(o, ['detalle', 'detalles', 'details', 'descripcion', 'description', 'notas', 'notes', 'contenido', 'content', 'ejercicios', 'workout', 'wod']));
    const timeText = asText(pick(o, ['hora', 'time', 'horainicio', 'starttime']));
    const time = isoTime ?? (timeText ? parseTime(timeText) : undefined);
    const endText = asText(pick(o, ['horafin', 'fin', 'hasta', 'end', 'endtime', 'horafinal', 'final']));
    let endTime = endText ? parseTime(endText.replace(/^\d{4}-\d{2}-\d{2}[T ]/, '')) : undefined;
    const minutes = Number(pick(o, ['duracion', 'duration', 'minutos', 'minutes', 'duracionmin', 'durationminutes']));
    if (!endTime && time && minutes > 0 && minutes < 24 * 60) endTime = addMinutesToTime(time, minutes);
    if (endTime && time && endTime <= time) endTime = undefined;
    const tipo = fold(asText(pick(o, ['tipo', 'type', 'kind'])) ?? '');
    const kind = KIND_WORDS.find(([re]) => re.test(tipo))?.[1];
    out.push({
      date,
      title: title.split('\n')[0],
      details,
      time,
      ...(endTime ? { endTime } : {}),
      ...(asText(pick(o, ['categoria', 'category', 'etiqueta', 'label'])) ? { category: asText(pick(o, ['categoria', 'category', 'etiqueta', 'label']))!.split('\n')[0].slice(0, 40) } : {}),
      ...(kind ? { kind } : {}),
      ...(asText(pick(o, ['lugar', 'location', 'sitio', 'ubicacion', 'donde'])) ? { location: asText(pick(o, ['lugar', 'location', 'sitio', 'ubicacion', 'donde'])) } : {}),
    });
  }
  return out;
}

export function parsePlan(text: string, opts: ImportOptions): { items: ImportedItem[]; skipped: number } {
  const trimmed = text.trim();
  if (/^(```(json)?\s*)?[[{]/i.test(trimmed)) {
    const json = extractJson(trimmed);
    const items = json !== undefined ? planFromJson(json, opts) : null;
    if (items) return { items: finalize(items, opts), skipped: 0 };
  }

  const items: ImportedItem[] = [];
  let current: ImportedItem | null = null;
  let week = 1;
  let weekStart = '';
  let skipped = 0;
  let roles: string[] | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    let line = rawLine.trim();

    // Tablas Markdown
    if (line.startsWith('|')) {
      const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue;
      const r = tableRoles(cells);
      if (r) {
        roles = r;
        continue;
      }
      if (roles) {
        const get = (role: string) => cells.filter((_, i) => roles![i] === role).map(stripMarkdown).join(' ');
        const others = cells.filter((_, i) => roles![i] === 'other').map(stripMarkdown).filter(Boolean);
        const datePart = get('date') || (get('week') ? `Semana ${get('week')} ${get('day')}` : get('day'));
        const details = [get('details'), ...others].filter(Boolean).join('\n');
        line = [datePart, get('time'), get('title') || others.shift() || '', details].filter((x, i) => i !== 1 || x).join(' | ');
      } else line = cells.map(stripMarkdown).join(' | ');
    }

    const clean = stripMarkdown(line);
    const f = fold(clean);

    // Cabecera de semana: "Semana 2" o "Semana 2 (26/10 - 1/11)"
    const wh = /^(?:semana|week)\s*(\d{1,2})\b(.*)$/.exec(f);
    if (wh && !new RegExp(`^\\s*[,:·-]?\\s*${WD_LONG}\\b`).test(wh[2])) {
      week = Number(wh[1]);
      weekStart = '';
      const inner = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(wh[2]);
      if (inner) {
        const d = inner[3]
          ? makeISODate(Number(inner[3]) < 100 ? 2000 + Number(inner[3]) : Number(inner[3]), Number(inner[2]), Number(inner[1]))
          : inferDate(Number(inner[1]), Number(inner[2]), opts.today);
        if (d) weekStart = startOfWeek(d);
      }
      current = null;
      continue;
    }

    const tok = leadingDate(clean, week, weekStart, opts);
    if (tok?.date) {
      const { title, details, time } = splitTitle(tok.rest);
      current = { date: tok.date, title, details, time };
      items.push(current);
      continue;
    }

    if (current) {
      current.details = current.details ? `${current.details}\n${clean}` : clean;
    } else skipped++;
  }

  return { items: finalize(items, opts), skipped };
}

function finalize(items: ImportedItem[], opts: ImportOptions): ImportedItem[] {
  return items
    .map((it) => {
      let { title, details } = it;
      title = title.replace(/\s+/g, ' ').trim();
      if (!title && details && !opts.keepBody) {
        const [first, ...rest] = details.split('\n');
        if (first.length <= 80) {
          title = first.trim();
          details = rest.join('\n').trim() || undefined;
        }
      }
      if (!title) title = opts.defaultTitle ?? 'Sesión';
      if (title.length > 120) {
        details = details ? `${title}\n${details}` : title;
        title = `${title.slice(0, 60).trim()}…`;
      }
      return { ...it, title, details: details?.trim() || undefined };
    })
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
}

/* ------------------------------------------------------------------ */
/* Lo que se le pide a la IA (ChatGPT, Claude…)                         */
/* ------------------------------------------------------------------ */

/** Instrucciones para que una IA devuelva el plan en el formato que entiende la app. */
export function importPrompt(start: ISODate, category = 'Running'): string {
  return `Convierte el plan que hemos preparado en un JSON para importarlo en mi calendario. Reglas:
- Una lista con un elemento por sesión o cosa que hacer.
- Cada elemento: "fecha" (AAAA-MM-DD), "titulo" (corto) y, si hace falta, "hora" (HH:MM), "horaFin" o "duracion" (minutos), "detalle" (usa \\n para saltos de línea), "categoria" y "tipo" ("tarea" si es algo que hacer y marcar como hecho, "evento" si es una cita).
- Usa fechas reales empezando el ${start}.
- Responde SOLO con el JSON, sin explicaciones.

Ejemplo:
[
  {"fecha": "${start}", "hora": "19:00", "duracion": 45, "titulo": "Rodaje suave 6 km", "detalle": "Ritmo 6:15/km\\nEstiramientos al acabar", "categoria": "${category}", "tipo": "tarea"}
]`;
}
