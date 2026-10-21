import type { FinAccount, FinanceState, FinKind, FinScope, ISODate, Movement, Recurring } from '../store/types';
import { addDays, addMonths, daysBetween, MONTHS_SHORT, parseISODate, toISODate } from './dates';
import { fold } from './quickParse';

/* ---------- Categorías ---------- */

export interface Category {
  key: string;
  label: string;
  emoji: string;
  kind: FinKind;
  /** Palabras que la delatan en el concepto («mercadona» → súper). */
  words: string[];
}

const cat = (key: string, label: string, emoji: string, kind: FinKind, words: string): Category => ({
  key,
  label,
  emoji,
  kind,
  words: words
    .split(',')
    .map((w) => fold(w.trim()))
    .filter(Boolean),
});

export const CATEGORIES: Category[] = [
  cat('super', 'Súper', '🛒', 'gasto', 'super, supermercado, la compra, compra semanal, mercadona, carrefour, lidl, alcampo, eroski, aldi, hipercor, consum, ahorramas, bonpreu, caprabo, gadis, froiz, fruteria, carniceria, pescaderia, panaderia, mercado'),
  cat('restaurantes', 'Restaurantes y bares', '🍽️', 'gasto', 'restaurante, bar, cafe, cafeteria, cerveza, cena, cena fuera, comida fuera, desayuno fuera, menu del dia, tapas, burger, hamburguesa, pizza, kebab, sushi, glovo, just eat, uber eats, telepizza, mcdonalds, vermut, copas, cañas'),
  cat('ocio', 'Ocio', '🎉', 'gasto', 'ocio, cine, concierto, entradas, entrada, teatro, museo, fiesta, festival, escape room, bolera, videojuego, juego, planes'),
  cat('compras', 'Compras y ropa', '🛍️', 'gasto', 'ropa, zapatos, zapatillas, zara, primark, mango, pull and bear, bershka, amazon, aliexpress, shein, el corte ingles, regalo para mi, peluqueria, cosmetica, perfume'),
  cat('transporte', 'Transporte', '🚗', 'gasto', 'gasolina, gasoil, diesel, repsol, cepsa, galp, parking, aparcamiento, metro, bus, autobus, renfe, cercanias, taxi, cabify, uber, bolt, peaje, itv, taller, coche, abono transporte, bicing'),
  cat('hipoteca', 'Hipoteca o alquiler', '🏠', 'gasto', 'hipoteca, alquiler, renta piso'),
  cat('facturas', 'Luz, agua, gas e internet', '💡', 'gasto', 'luz, electricidad, iberdrola, endesa, naturgy, holaluz, agua, canal de isabel ii, gas, butano, internet, fibra, movil, telefono, vodafone, orange, movistar, digi, jazztel, masmovil, yoigo, pepephone, o2'),
  cat('casa', 'Casa', '🛋️', 'gasto', 'comunidad, casa, hogar, muebles, ikea, leroy merlin, bricomart, reparacion, fontanero, electricista, limpieza, menaje, decoracion, electrodomestico'),
  cat('salud', 'Salud', '💊', 'gasto', 'farmacia, medico, dentista, fisio, fisioterapeuta, optica, gafas, lentillas, analisis, psicologo, hospital, medicinas'),
  cat('deporte', 'Deporte', '🏋️', 'gasto', 'gimnasio, gym, crossfit, box, padel, tenis, piscina, carrera, dorsal, maraton, decathlon, yoga, pilates, cuota gimnasio'),
  cat('suscripciones', 'Suscripciones', '📺', 'gasto', 'netflix, spotify, hbo, max, disney, prime, amazon prime, icloud, google one, youtube, apple music, dazn, filmin, chatgpt, claude, suscripcion'),
  cat('viajes', 'Viajes', '✈️', 'gasto', 'viaje, vuelo, vuelos, hotel, airbnb, booking, ryanair, vueling, iberia, easyjet, ave, vacaciones, escapada'),
  cat('regalos', 'Regalos', '🎁', 'gasto', 'regalo, regalos, cumpleaños, cumple, boda, bautizo, comunion, navidad, reyes, amigo invisible'),
  cat('formacion', 'Formación', '📚', 'gasto', 'curso, libro, libros, academia, matricula, universidad, uned, master, clases, material escolar'),
  cat('seguros', 'Seguros', '🛡️', 'gasto', 'seguro, seguro coche, seguro hogar, seguro de vida, mapfre, mutua, sanitas, adeslas, axa, allianz, linea directa, generali'),
  cat('impuestos', 'Impuestos', '🧾', 'gasto', 'ibi, hacienda, impuesto, impuestos, renta, multa, tasa, basuras, ivtm, sello coche'),
  cat('mascotas', 'Mascotas', '🐾', 'gasto', 'veterinario, pienso, perro, gato, mascota, arena gato, peluqueria canina'),
  cat('otros', 'Otros gastos', '💸', 'gasto', ''),
  cat('nomina', 'Nómina', '💼', 'ingreso', 'nomina, sueldo, salario, paga, paga extra'),
  cat('aportacion', 'Aportación', '🤝', 'ingreso', 'aportacion, aporte, transferencia, traspaso, ingreso cuenta'),
  cat('extra', 'Extra', '✨', 'ingreso', 'bizum, venta, wallapop, vinted, devolucion, reembolso, regalo dinero, intereses, dividendos, freelance, factura cobrada'),
  cat('otros-ingresos', 'Otros ingresos', '💰', 'ingreso', ''),
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryOf(key: string | undefined): Category {
  return (key && BY_KEY.get(key)) || BY_KEY.get('otros')!;
}

export const categoriesFor = (kind: FinKind) => CATEGORIES.filter((c) => c.kind === kind);

/** Adivina la categoría por el concepto («Mercadona» → súper, «gasolina» → transporte). */
export function guessCategory(text: string, kind: FinKind): string | undefined {
  const t = ` ${fold(text).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (!t.trim()) return undefined;
  let best: { key: string; len: number } | undefined;
  for (const c of CATEGORIES) {
    if (c.kind !== kind) continue;
    for (const w of c.words) {
      const hit = t.includes(` ${w} `) || t.includes(` ${w}s `) || t.includes(` ${w}es `);
      if (hit && (!best || w.length > best.len)) best = { key: c.key, len: w.length };
    }
  }
  return best?.key;
}

/* ---------- Dinero ---------- */

const eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** «12,50 €»; con `round`, sin céntimos si es una cifra redonda («1240 €»). */
export function eur(n: number, round = false): string {
  const v = Math.round(n * 100) / 100;
  return round && Number.isInteger(v) ? eur0.format(v) : eur2.format(v);
}

/** En euros enteros, para resúmenes («300 €»). */
export const eurInt = (n: number) => eur0.format(Math.round(n));

/** Importe escrito («12,5», «1.240,50», «1240.5 €») → número con céntimos. */
export function parseAmount(s: string): number | null {
  let t = s.replace(/[€\s]/g, '').replace(/eur(os)?$/i, '');
  if (!t) return null;
  // «1.240,50» → «1240.50»; «1,240.50» → «1240.50»
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(?:$|\.)/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/* ---------- Periodos flexibles ---------- */

/** Día `day` del mes (0-11, puede pasarse de rango); si el mes es más corto, el último día. */
export function dayOfMonth(year: number, month0: number, day: number): ISODate {
  const first = new Date(year, month0, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toISODate(new Date(first.getFullYear(), first.getMonth(), Math.min(day, last)));
}

/** Cuándo se espera que empiece el periodo siguiente (el próximo día de cobro, al menos 20 días después). */
export function expectedNextStart(start: ISODate, payday?: number): ISODate {
  if (!payday) return addMonths(start, 1);
  const d = parseISODate(start);
  for (let k = 0; k <= 2; k++) {
    const cand = dayOfMonth(d.getFullYear(), d.getMonth() + k, payday);
    if (daysBetween(start, cand) >= 20) return cand;
  }
  return addMonths(start, 1);
}

function previousExpectedStart(start: ISODate, payday?: number): ISODate {
  if (!payday) return addMonths(start, -1);
  const d = parseISODate(start);
  for (let k = 1; k <= 2; k++) {
    const cand = dayOfMonth(d.getFullYear(), d.getMonth() - k, payday);
    if (daysBetween(cand, start) >= 20) return cand;
  }
  return addMonths(start, -1);
}

export interface Period {
  start: ISODate;
  /** Último día (incluido). Sin él, el periodo sigue abierto hasta que se cobre. */
  end?: ISODate;
  /** Último día previsto (el de antes del próximo cobro). */
  estimatedEnd: ISODate;
  /** No está guardado: es un periodo de antes del primero que se configuró. */
  virtual?: boolean;
}

export const periodLast = (p: Period) => p.end ?? p.estimatedEnd;

/** Hasta dónde llega un periodo abierto: al menos hasta hoy (sigue hasta que se cobre). */
export const openUntil = (p: Period, today: ISODate) => p.end ?? (p.estimatedEnd < today ? today : p.estimatedEnd);

/** Inicio por defecto si aún no se ha configurado: el último día de cobro (o el día 1). */
function defaultStart(acc: FinAccount, today: ISODate): ISODate {
  const d = parseISODate(today);
  const day = acc.payday ?? 1;
  const thisMonth = dayOfMonth(d.getFullYear(), d.getMonth(), day);
  return thisMonth <= today ? thisMonth : dayOfMonth(d.getFullYear(), d.getMonth() - 1, day);
}

/**
 * Los periodos de una cuenta, del más antiguo al actual. Si hay movimientos de
 * antes del primer periodo guardado, se añaden periodos «virtuales» hacia atrás.
 */
export function periodsOf(acc: FinAccount, today: ISODate, earliest?: ISODate): Period[] {
  const starts = [...new Set(acc.periodStarts)].sort();
  const configured = starts.length > 0;
  if (!configured) starts.push(defaultStart(acc, today));
  const list: Period[] = starts.map((start, i) => {
    const next = starts[i + 1];
    const end = next ? addDays(next, -1) : undefined;
    return { start, end, estimatedEnd: end ?? addDays(expectedNextStart(start, acc.payday), -1), virtual: configured ? undefined : true };
  });
  while (earliest && list[0].start > earliest && list.length < 600) {
    const first = list[0];
    const start = previousExpectedStart(first.start, acc.payday);
    list.unshift({ start, end: addDays(first.start, -1), estimatedEnd: addDays(first.start, -1), virtual: true });
  }
  // Los que aún no han empezado no se muestran (solo marcan el final del actual).
  return list.filter((p, i) => i === 0 || p.start <= today);
}

export function currentPeriod(acc: FinAccount, today: ISODate): Period {
  const list = periodsOf(acc, today);
  return list[list.length - 1];
}

/** ¿Toca preguntar si ya se ha cobrado? (Ha llegado el día y el periodo sigue abierto.) */
export function payDue(acc: FinAccount, today: ISODate): boolean {
  if (!acc.periodStarts.length) return false;
  const p = currentPeriod(acc, today);
  return !p.end && today > p.estimatedEnd;
}

/** Días que quedan del periodo contando hoy (0 si ya debería haber terminado). */
export function daysLeft(p: Period, today: ISODate): number {
  return Math.max(0, daysBetween(today, periodLast(p)) + 1);
}

/** «25 sep – 24 oct» o, si sigue abierto, «Desde el 25 sep». */
export function periodLabel(p: Period, today: ISODate): string {
  const f = (iso: ISODate) => {
    const d = parseISODate(iso);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${iso.slice(0, 4) !== today.slice(0, 4) ? ` ${iso.slice(2, 4)}` : ''}`;
  };
  return p.end ? `${f(p.start)} – ${f(p.end)}` : `Desde el ${f(p.start)}`;
}

/* ---------- Cambiar las fechas de los periodos ---------- */

/** Empezar un periodo nuevo ese día (al cobrar). */
export function withStart(starts: ISODate[], date: ISODate): ISODate[] {
  return [...new Set([...starts, date])].sort();
}

/** Mover el inicio de un periodo (sin pasar por encima de los de al lado). Null si no cabe. */
export function moveStart(starts: ISODate[], from: ISODate, to: ISODate): ISODate[] | null {
  const s = [...new Set(starts)].sort();
  const i = s.indexOf(from);
  if (i === -1) return withStart(s, to);
  if ((i > 0 && to <= s[i - 1]) || (i < s.length - 1 && to >= s[i + 1])) return null;
  s[i] = to;
  return s.sort();
}

/**
 * Poner (o quitar) el último día de un periodo. Termina el día antes de que empiece
 * el siguiente, así que se mueve o se crea ese inicio. Null si no cabe.
 */
export function setEnd(starts: ISODate[], periodStart: ISODate, end: ISODate | undefined): ISODate[] | null {
  const s = withStart(starts, periodStart);
  const i = s.indexOf(periodStart);
  const next = s[i + 1];
  if (end === undefined) return next ? s.filter((x) => x !== next) : s;
  if (end < periodStart) return null;
  const nextStart = addDays(end, 1);
  if (!next) return [...s, nextStart];
  if (i + 2 < s.length && nextStart >= s[i + 2]) return null;
  s[i + 1] = nextStart;
  return s;
}

/* ---------- Fijos ---------- */

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthKeyOf = (mi: number) => `${Math.floor(mi / 12)}-${String((mi % 12) + 1).padStart(2, '0')}`;

export interface Occurrence {
  recurring: Recurring;
  date: ISODate;
  /** 'AAAA-MM' */
  month: string;
  amount: number;
  /** Ya cargado (ha pasado el día o está apuntado el cargo real). */
  charged: boolean;
  /** El cargo real apuntado, si lo hay. */
  movement?: Movement;
}

/** Los cargos de los fijos que caen entre dos fechas. */
export function occurrencesIn(recurring: Recurring[], movements: Movement[], start: ISODate, end: ISODate, today: ISODate): Occurrence[] {
  const out: Occurrence[] = [];
  for (const r of recurring) {
    if (r.deleted || !r.active) continue;
    const anchor = monthIndex(r.from);
    for (let mi = Math.max(monthIndex(start), anchor); mi <= monthIndex(end); mi++) {
      if ((mi - anchor) % r.every !== 0) continue;
      const date = dayOfMonth(Math.floor(mi / 12), mi % 12, r.day);
      if (date < start || date > end || date < r.from) continue;
      const month = monthKeyOf(mi);
      if (r.skips?.includes(month)) continue;
      const movement = movements.find((m) => !m.deleted && m.recurringId === r.id && m.date.slice(0, 7) === month);
      out.push({ recurring: r, date, month, amount: movement?.amount ?? r.amount, charged: !!movement || date <= today, movement });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.recurring.name.localeCompare(b.recurring.name));
}

/* ---------- Resumen de un periodo ---------- */

export interface Summary {
  spent: number;
  income: number;
  /** Fijos de gasto que aún no se han cargado en el periodo. */
  pending: number;
  pendingIncome: number;
  byCategory: { key: string; amount: number }[];
  movements: Movement[];
  occurrences: Occurrence[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function summarize(
  fin: Pick<FinanceState, 'movements' | 'recurring'>,
  scope: FinScope,
  start: ISODate,
  end: ISODate,
  today: ISODate,
  /** Hasta dónde se cuentan los fijos (por defecto, `end`). */
  fixedEnd: ISODate = end,
): Summary {
  const scoped = fin.movements.filter((m) => m.scope === scope && !m.deleted);
  const movements = scoped.filter((m) => m.date >= start && m.date <= end).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const occurrences = occurrencesIn(
    fin.recurring.filter((r) => r.scope === scope),
    scoped,
    start,
    fixedEnd,
    today,
  );
  let spent = 0;
  let income = 0;
  let pending = 0;
  let pendingIncome = 0;
  const byCat = new Map<string, number>();
  const addCat = (k: string, v: number) => byCat.set(k, (byCat.get(k) ?? 0) + v);
  for (const m of movements) {
    if (m.kind === 'gasto') {
      spent += m.amount;
      addCat(m.category, m.amount);
    } else income += m.amount;
  }
  // Los fijos sin cargo real apuntado cuentan con su importe previsto.
  for (const o of occurrences) {
    if (o.movement) continue;
    if (o.recurring.kind === 'gasto') {
      if (o.charged) {
        spent += o.amount;
        addCat(o.recurring.category, o.amount);
      } else pending += o.amount;
    } else if (o.charged) income += o.amount;
    else pendingIncome += o.amount;
  }
  return {
    spent: cents(spent),
    income: cents(income),
    pending: cents(pending),
    pendingIncome: cents(pendingIncome),
    byCategory: [...byCat].map(([key, amount]) => ({ key, amount: cents(amount) })).sort((a, b) => b.amount - a.amount),
    movements,
    occurrences,
  };
}

/**
 * Resumen de un periodo. Si sigue abierto, entra todo lo apuntado desde que
 * empezó (aunque ya haya pasado el día de cobro previsto).
 */
export function summarizePeriod(fin: Pick<FinanceState, 'movements' | 'recurring'>, scope: FinScope, p: Period, today: ISODate): Summary {
  return summarize(fin, scope, p.start, p.end ?? '9999-12-31', today, openUntil(p, today));
}

/** Objetivos de gasto por categoría con lo gastado en el periodo. */
export function budgetLines(acc: FinAccount, s: Summary): { key: string; limit: number; spent: number }[] {
  const spentBy = new Map(s.byCategory.map((c) => [c.key, c.amount]));
  return Object.entries(acc.budgets)
    .filter(([, limit]) => limit > 0)
    .map(([key, limit]) => ({ key, limit, spent: spentBy.get(key) ?? 0 }))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
}

/**
 * Con el saldo apuntado un día: el saldo estimado hoy y al final del periodo
 * (sumando lo apuntado después y los fijos que faltan).
 */
export function balanceForecast(
  acc: FinAccount,
  fin: Pick<FinanceState, 'movements' | 'recurring'>,
  scope: FinScope,
  period: Period,
  today: ISODate,
): { now: number; end: number } | null {
  const b = acc.balance;
  const last = openUntil(period, today);
  if (!b || b.date > last) return null;
  const from = addDays(b.date, 1);
  const at = (until: ISODate) => {
    if (until < from) return b.amount;
    const s = summarize(fin, scope, from, until, today);
    // Hasta `until` cuentan también los fijos aún no cargados de esas fechas.
    return cents(b.amount + s.income + s.pendingIncome - s.spent - s.pending);
  };
  return { now: at(today < last ? today : last), end: at(last) };
}
