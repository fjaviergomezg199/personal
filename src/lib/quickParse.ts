import type { EntryKind, HHMM, ISODate, Repeat } from '../store/types';
import { addDays, addMonths, makeHHMM, makeISODate, todayISO, toHHMM, toISODate, weekdayIndex } from './dates';

/**
 * "Añadir rápido": entiende frases en español como
 *   "mañana a las 10 dentista", "cumple de Marta 12/03",
 *   "entradas Rosalía viernes 10:00", "todos los lunes 9:00 reunión".
 */
export interface QuickResult {
  kind: EntryKind | 'birthday';
  title: string;
  date?: ISODate;
  time?: HHMM;
  endTime?: HHMM;
  repeat: Repeat;
  category?: string;
  /** Aviso sugerido (minutos antes) o undefined para usar el de los ajustes. */
  alert?: number;
  birthday?: { name: string; day?: number; month?: number; year?: number };
}

const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n', ç: 'c',
};

/** «#running» en lo que se escribe: el nombre de la categoría y el texto sin él. */
export function splitHashtag(text: string): { tag?: string; rest: string } {
  const m = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_.-]{0,29})/u.exec(text);
  if (!m) return { rest: text };
  return { tag: m[2], rest: (text.slice(0, m.index) + m[1] + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim() };
}

/** Minúsculas y sin tildes conservando la longitud (para alinear índices). */
export function fold(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const l = c.toLowerCase();
    out += l.length === 1 ? (ACCENTS[l] ?? l) : c;
  }
  return out;
}

const WD = '(lunes|martes|miercoles|jueves|viernes|sabado|domingo)';
const MONTH_RE =
  '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)';
const MONTH_INDEX: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6,
  julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sept: 9, sep: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};
const WEEKDAY_INDEX: Record<string, number> = {
  lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, sabados: 5, domingo: 6, domingos: 6,
};
const NUM_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30,
};
const HOUR_WORDS = '(una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
const PART_TIMES: Record<string, HHMM> = { manana: '09:00', mediodia: '14:00', tarde: '17:00', noche: '21:00' };

const CATEGORY_RULES: { key: string; re: RegExp; kind: EntryKind }[] = [
  { key: 'tickets', re: /\b(entradas?|preventa|tickets?)\b/, kind: 'reminder' },
  { key: 'concert', re: /\b(concierto|festival|gira)\b/, kind: 'event' },
  { key: 'trip', re: /\b(viaje|vuelo|avion|tren|hotel|escapada|vacaciones)\b/, kind: 'event' },
  { key: 'party', re: /\b(fiesta|boda|bautizo|comunion|despedida|celebracion)\b/, kind: 'event' },
  { key: 'food', re: /\b(cena|cenar|comida con|comer con|desayuno con|brunch|vermu|vermut|cafe con|tapas|restaurante)\b/, kind: 'event' },
  { key: 'health', re: /\b(medico|medica|dentista|cita|fisio|fisioterapeuta|analisis|revision medica|vacuna|ginecologo|ginecologa|oculista|hospital|psicologo|psicologa|nutri|nutricionista|dermatologo|dermatologa)\b/, kind: 'event' },
  { key: 'culture', re: /\b(teatro|cine|museo|exposicion|musical|opera|ballet|monologo)\b/, kind: 'event' },
  { key: 'sport', re: /\b(partido|carrera|entreno|entrenamiento|maraton|gimnasio|gym|crossfit|yoga|pilates|padel|tenis|natacion|rodaje|tirada)\b/, kind: 'event' },
  { key: 'study', re: /\b(examen|clase|tutoria|seminario|entrega del? trabajo|practica)\b/, kind: 'event' },
  { key: 'work', re: /\b(reunion|claustro|guardia)\b/, kind: 'event' },
  { key: 'money', re: /\b(pagar|pago|factura|recibo|alquiler|hipoteca|seguro|impuestos?|hacienda)\b/, kind: 'reminder' },
  { key: 'home', re: /\b(limpiar|lavadora|basura|compra|super|supermercado|fontanero|electricista|casa)\b/, kind: 'task' },
];

const TASK_VERBS =
  /^\s*(comprar|llamar|pagar|enviar|mandar|pedir|reservar|hacer|llevar|recoger|devolver|renovar|preparar|escribir|contestar|responder|revisar|limpiar|sacar|lavar|ordenar|buscar|mirar|leer|estudiar|terminar|acabar|empezar|apuntar|cancelar|confirmar)\b/;

const ALERT_BY_CATEGORY: Record<string, number> = { tickets: 10, health: 60, trip: 120 };

function resolveHour(h: number, qualifier: string | undefined, oneDigit: boolean): number {
  switch (qualifier) {
    case 'tarde':
    case 'pm':
      return h < 12 ? h + 12 : h;
    case 'noche':
      if (h === 12) return 0;
      return h >= 6 && h < 12 ? h + 12 : h;
    case 'manana':
    case 'madrugada':
    case 'am':
      return h === 12 ? 0 : h;
    default:
      // "a las 5" casi siempre es por la tarde.
      return oneDigit && h >= 1 && h <= 6 ? h + 12 : h;
  }
}

function minuteWord(w?: string): number {
  if (!w) return 0;
  if (w.includes('media')) return 30;
  if (w.includes('menos cuarto')) return -15;
  if (w.includes('cuarto')) return 15;
  return 0;
}

export function parseQuick(input: string, now: Date = new Date()): QuickResult {
  let s = input;
  let f = fold(input);
  const today = todayISO(now);

  const blank = (a: number, b: number) => {
    const pad = ' '.repeat(b - a);
    s = s.slice(0, a) + pad + s.slice(b);
    f = f.slice(0, a) + pad + f.slice(b);
  };
  const take = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = 0;
    const m = re.exec(f);
    if (m) blank(m.index, m.index + m[0].length);
    return m;
  };

  let date: ISODate | undefined;
  let time: HHMM | undefined;
  let endTime: HHMM | undefined;
  let repeat: Repeat = 'none';
  let explicitYear = false;
  let birthdayYear: number | undefined;
  let partOfDay: string | undefined;
  let kind: QuickResult['kind'] | undefined;

  const nextWeekday = (wd: number, includeToday: boolean): ISODate => {
    let diff = (wd - weekdayIndex(today) + 7) % 7;
    if (diff === 0 && !includeToday) diff = 7;
    return addDays(today, diff);
  };
  const nextDayOfMonth = (day: number): ISODate | undefined => {
    const [y, m] = today.split('-').map(Number);
    for (let i = 0; i < 13; i++) {
      const cand = makeISODate(y + Math.floor((m - 1 + i) / 12), ((m - 1 + i) % 12) + 1, day);
      if (cand && cand >= today) return cand;
    }
    return undefined;
  };
  const withYear = (day: number, month: number, year?: number): ISODate | undefined => {
    if (year !== undefined) {
      const y = year < 100 ? 2000 + year : year;
      explicitYear = true;
      birthdayYear = y;
      return makeISODate(y, month, day) ?? undefined;
    }
    const y = now.getFullYear();
    const cand = makeISODate(y, month, day);
    if (!cand) return makeISODate(y + 1, month, day) ?? undefined;
    return cand >= today ? cand : (makeISODate(y + 1, month, day) ?? undefined);
  };

  // --- Cumpleaños y recordatorio explícito ---
  if (take(/\b(cumpleanos|cumple)\b(\s+de)?/)) kind = 'birthday';
  if (take(/^\s*(recuerdame|recordarme|recordar|recordatorio|acuerdate de|avisame)\b:?(\s+(que|de))?/)) kind = 'reminder';

  // --- Repeticiones ---
  let m: RegExpExecArray | null;
  if (take(/\b(de lunes a viernes|entre semana|todos los dias laborables|dias laborables|cada dia laborable)\b/)) {
    repeat = 'weekdays';
  } else if (take(/\b(todos los dias|cada dia|a diario|diariamente)\b/)) {
    repeat = 'daily';
  } else if ((m = take(new RegExp(`\\b(todos los|todas las|cada) ${WD}s?\\b`)))) {
    repeat = 'weekly';
    date = nextWeekday(WEEKDAY_INDEX[m[2]], true);
  } else if (take(/\b(cada semana|todas las semanas|semanalmente)\b/)) {
    repeat = 'weekly';
  } else if ((m = take(/\b(?:el )?(?:dia )?(\d{1,2}) de cada mes\b/))) {
    repeat = 'monthly';
    date = nextDayOfMonth(Number(m[1]));
  } else if (take(/\b(cada mes|todos los meses|mensualmente)\b/)) {
    repeat = 'monthly';
  } else if (take(/\b(cada ano|todos los anos|anualmente)\b/)) {
    repeat = 'yearly';
  }

  // --- Relativo: "en 2 horas", "dentro de 3 días" ---
  if ((m = take(/\b(?:en|dentro de) media hora\b/))) {
    const d = new Date(now.getTime() + 30 * 60000);
    date = toISODate(d);
    time = toHHMM(d);
  } else if (
    (m = take(/\b(?:en|dentro de) (\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta) (minutos?|mins?|horas?|h|dias?|semanas?|meses|mes|anos?)\b/))
  ) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]];
    const unit = m[2];
    if (unit.startsWith('min') || unit.startsWith('h')) {
      const d = new Date(now.getTime() + n * (unit.startsWith('min') ? 1 : 60) * 60000);
      date = toISODate(d);
      time = toHHMM(d);
    } else if (unit.startsWith('dia')) date = addDays(today, n);
    else if (unit.startsWith('semana')) date = addDays(today, n * 7);
    else if (unit.startsWith('mes')) date = addMonths(today, n);
    else date = addMonths(today, n * 12);
  }

  // --- Fechas absolutas ---
  if (!date && (m = take(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    date = makeISODate(Number(m[1]), Number(m[2]), Number(m[3])) ?? undefined;
    explicitYear = true;
    birthdayYear = Number(m[1]);
  }
  if (!date && (m = take(/\b(?:el )?(?:dia )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      date = withYear(day, month, m[3] ? Number(m[3]) : undefined);
      if (kind === 'birthday' && !date && !m[3]) date = withYear(day, month);
    }
  }
  if (!date && (m = take(new RegExp(`\\b(?:el )?(?:dia )?(\\d{1,2})(?: de)? ${MONTH_RE}\\b\\.?(?:(?: de| del)? (\\d{4}))?`)))) {
    date = withYear(Number(m[1]), MONTH_INDEX[m[2]], m[3] ? Number(m[3]) : undefined);
  }

  // --- Horas (antes de "mañana" para no confundir "de la mañana") ---
  if ((m = take(/\b(?:de|desde las?) (\d{1,2})(?:[:.h](\d{2}))? (?:a|hasta) (?:las? )?(\d{1,2})(?:[:.h](\d{2}))?(?:\s*(?:h|horas)\b)?(?: (?:de la|por la) (manana|tarde|noche))?/))) {
    const q = m[5];
    const h1 = resolveHour(Number(m[1]), q, m[1].length === 1);
    let h2 = resolveHour(Number(m[3]), q, m[3].length === 1);
    if (h2 < h1 && h2 + 12 < 24) h2 += 12;
    time = makeHHMM(h1, Number(m[2] ?? 0)) ?? undefined;
    endTime = makeHHMM(h2, Number(m[4] ?? 0)) ?? undefined;
  } else if ((m = take(/\b(\d{1,2})[:.](\d{2})\s*(?:-|–|a)\s*(\d{1,2})[:.](\d{2})\s*(?:h\b)?/))) {
    time = makeHHMM(Number(m[1]), Number(m[2])) ?? undefined;
    endTime = makeHHMM(Number(m[3]), Number(m[4])) ?? undefined;
  }
  if (!time && (m = take(/\b(?:a|sobre|hacia|para|desde) las? (\d{1,2})(?:[:.h](\d{2}))?(?:\s*(?:h|hrs?|horas)\b)?( y media| y cuarto| menos cuarto| en punto)?(?: (?:de la|por la) (manana|tarde|noche|madrugada)|\s*(am|pm)\b)?/))) {
    const h = resolveHour(Number(m[1]), m[4] ?? m[5], m[1].length === 1 && !m[4] && !m[5]);
    let min = Number(m[2] ?? 0) + minuteWord(m[3]);
    let hh = h;
    if (min < 0) {
      min += 60;
      hh = (hh + 23) % 24;
    }
    time = makeHHMM(hh, min) ?? undefined;
  }
  if (!time && (m = take(new RegExp(`\\b(?:a|sobre|hacia|para) las? ${HOUR_WORDS}( y media| y cuarto| menos cuarto| en punto)?(?: (?:de la|por la) (manana|tarde|noche|madrugada))?\\b`)))) {
    const h = resolveHour(NUM_WORDS[m[1]], m[3], true);
    let min = minuteWord(m[2]);
    let hh = h;
    if (min < 0) {
      min += 60;
      hh = (hh + 23) % 24;
    }
    time = makeHHMM(hh, min) ?? undefined;
  }
  if (!time && (m = take(/\b(\d{1,2})[:.](\d{2})(?:\s*(?:h|hrs?|horas)\b)?/))) {
    time = makeHHMM(Number(m[1]), Number(m[2])) ?? undefined;
  }
  if (!time && (m = take(/\b(\d{1,2})\s*(h|am|pm)\b/))) {
    const q = m[2] === 'h' ? undefined : m[2];
    time = makeHHMM(resolveHour(Number(m[1]), q, false)) ?? undefined;
  }

  // --- Momentos del día y fechas con palabras ---
  if ((m = take(/\besta (manana|tarde|noche)\b/))) {
    partOfDay = m[1];
    if (!date) date = today;
  }
  if ((m = take(/\b(?:por|en|de) la (manana|tarde|noche)\b/))) partOfDay = m[1];
  if ((m = take(/\b(?:a )?mediodia\b/))) partOfDay = 'mediodia';
  if (!date && take(/\bpasado manana\b/)) date = addDays(today, 2);
  if (!date && take(/\bmanana\b/)) date = addDays(today, 1);
  if (!date && take(/\bhoy\b/)) date = today;
  if (!date && take(/\b(?:la semana que viene|la proxima semana|la semana proxima)\b/)) date = nextWeekday(0, false);
  if (!date && take(/\b(?:este |el )?(?:fin de semana|finde)\b/)) {
    const wd = weekdayIndex(today);
    date = wd >= 5 ? today : nextWeekday(5, false);
  }
  if (!date && (m = take(new RegExp(`\\b(el proximo |el |este |proximo )?${WD}( que viene| proximo)?\\b`)))) {
    const wd = WEEKDAY_INDEX[m[2]];
    const isThis = (m[1] ?? '').trim() === 'este';
    date = nextWeekday(wd, isThis);
  }
  if (!date && (m = take(/\b(?:el dia|el|dia) (\d{1,2})\b(?![:.,]\d|\s*(?:h\b|horas|%|km|kg|min|x\d))/))) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) date = nextDayOfMonth(day);
  }

  if (!time && partOfDay) time = PART_TIMES[partOfDay];

  // --- Título ---
  const title = cleanTitle(s);
  const ft = fold(title);

  // --- Categoría y tipo ---
  let category: string | undefined;
  let categoryKind: EntryKind | undefined;
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(ft)) {
      category = rule.key;
      categoryKind = rule.kind;
      break;
    }
  }

  if (kind === 'birthday' && (time || /\b(fiesta|celebracion|comida|cena|merienda)\b/.test(ft))) {
    // "fiesta de cumple de Ana el sábado a las 18:00" → es un plan, no un cumpleaños.
    kind = 'event';
    category = 'party';
  }

  if (kind === 'birthday') {
    const d = date ? date.split('-').map(Number) : undefined;
    return {
      kind: 'birthday',
      title: title,
      repeat: 'yearly',
      date,
      birthday: {
        name: title,
        day: d?.[2],
        month: d?.[1],
        year: explicitYear && birthdayYear && birthdayYear < now.getFullYear() ? birthdayYear : undefined,
      },
    };
  }

  if (!kind) {
    if (categoryKind === 'event') kind = 'event';
    else if (categoryKind === 'reminder' && category === 'tickets') kind = 'reminder';
    else if (date || time) kind = 'reminder';
    else if (TASK_VERBS.test(ft) || categoryKind === 'task' || categoryKind === 'reminder') kind = 'task';
    else kind = 'task';
    if (kind === 'event' && !date && !time) kind = 'task';
  }

  if (time && !date) {
    // Solo hora: hoy si aún no ha pasado, si no mañana.
    date = time > toHHMM(now) ? today : addDays(today, 1);
  }
  if (repeat !== 'none' && !date) date = today;

  return {
    kind,
    title,
    date,
    time,
    endTime,
    repeat,
    category,
    alert: category && time ? ALERT_BY_CATEGORY[category] : undefined,
  };
}

const EDGE_WORDS = '(?:el|a|al|de|del|en|para|y|e|que|sobre|hacia|desde|hasta)';
const TRAIL_WORDS = '(?:el|la|los|las|a|al|de|del|en|para|por|y|e|que|sobre|hacia|desde|hasta|con)';

export function cleanTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  // Sin \b: en JS no reconoce letras con tilde ("a" + "ún" no es palabra suelta).
  const lead = new RegExp(`^(?:(?:${EDGE_WORDS}(?=\\s|$)|[,;:.\\-–—])\\s*)+`, 'i');
  const trail = new RegExp(`(?:(?:^|\\s+)${TRAIL_WORDS}|\\s*[,;:\\-–—])+$`, 'i');
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t.replace(lead, '').replace(trail, '').trim();
    // Palabras sueltas que quedan en medio ("cena con Ana el" → ya cubierto) y dobles espacios
    t = t.replace(/\s+([,;:.])/g, '$1').replace(/\s+/g, ' ');
    if (t === before) break;
  }
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
