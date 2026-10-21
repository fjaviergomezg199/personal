import type { FinKind, ISODate, Movement } from '../store/types';
import { makeISODate } from './dates';
import { guessCategory } from './finance';
import { fold } from './quickParse';

/*
 * Movimientos descargados del banco (Excel .xlsx, CSV o filas pegadas) →
 * gastos e ingresos. Cada banco lo exporta a su manera: se busca la fila de
 * títulos y las columnas de fecha, concepto e importe (o cargo y abono).
 */

export type Table = string[][];

/* ---------- Leer el fichero ---------- */

/** Texto de un CSV: UTF-8 o, si no cuadra, Windows-1252 (lo habitual en los bancos). */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** CSV o filas pegadas (separadas por «;», «,», tabuladores o varios espacios). */
export function parseDelimited(text: string): Table {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const sample = lines.slice(0, 30).join('\n');
  const count = (re: RegExp) => (sample.match(re) ?? []).length;
  const delim = count(/\t/g) >= lines.length / 2 ? '\t' : count(/;/g) >= lines.length / 2 ? ';' : count(/,/g) >= lines.length ? ',' : null;
  return lines.map((line) => {
    if (!delim) return line.trim().split(/\s{2,}/);
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) {
        out.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  });
}

const XML_ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENT[e] ?? m)));

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lee los ficheros de un .zip (un .xlsx lo es). */
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('No es un fichero Excel (.xlsx) válido.');
  const entries = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let k = 0; k < entries; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (/^xl\/(sharedStrings|worksheets\/sheet\d+|workbook)\.xml$/.test(name)) out.set(name, method === 8 ? await inflateRaw(data) : data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** Primera hoja de un .xlsx como tabla de textos (las fechas de Excel salen como número de serie). */
export async function readXlsx(buf: ArrayBuffer): Promise<Table> {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const shared: string[] = [];
  const ss = files.get('xl/sharedStrings.xml');
  if (ss) {
    for (const m of dec.decode(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
    }
  }
  const sheetName = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) throw new Error('El Excel no tiene hojas.');
  const xml = dec.decode(files.get(sheetName)!);
  const table: Table = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && raw !== undefined) value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = unxml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else if (raw !== undefined) value = unxml(raw);
      const i = ref ? colIndex(ref) : cells.length;
      while (cells.length < i) cells.push('');
      cells[i] = value.trim();
    }
    table.push(cells);
  }
  return table;
}

/** Un fichero del banco → tabla. */
export async function readBankFile(file: File): Promise<Table> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  if (head[0] === 0x50 && head[1] === 0x4b) return readXlsx(buf);
  if (head[0] === 0xd0 && head[1] === 0xcf) throw new Error('Es un Excel antiguo (.xls). Ábrelo y guárdalo como .xlsx o .csv, o copia las filas y pégalas aquí.');
  return parseDelimited(decodeText(buf));
}

/* ---------- Entender las columnas ---------- */

/** «21/10/2026», «21-10-26», «2026-10-21» o número de serie de Excel → fecha. */
export function parseBankDate(s: string): ISODate | null {
  const t = s.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return makeISODate(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return makeISODate(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    if (serial > 30000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return makeISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  return null;
}

/** «-12,50 €», «1.234,56», «−9.99», «(12,50)» → número con signo. */
export function parseBankAmount(s: string): number | null {
  let t = s.replace(/[€\s ]|EUR/gi, '').replace(/[−–]/g, '-');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith('-')) {
    neg = !neg;
    t = t.slice(1);
  } else if (t.startsWith('+')) t = t.slice(1);
  if (t.endsWith('-')) {
    neg = !neg;
    t = t.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(t)) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) t = t.replace(/,/g, '');
  else if (lastDot >= 0 && /\.\d{3}$/.test(t) && (t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

export interface Columns {
  header: number;
  date: number;
  concept: number;
  amount?: number;
  debit?: number;
  credit?: number;
}

const has = (cell: string, ...words: string[]) => {
  const f = fold(cell);
  return words.some((w) => f.includes(w));
};

/** «Fecha», «Fecha operación», «F. Operación», «F.Valor»… */
const isDateHeader = (cell: string) => {
  const f = fold(cell).trim();
  return f.includes('fecha') || /^f\.?\s?(op|valor|contable)/.test(f) || f === 'dia' || f === 'date';
};
const isValueDate = (cell: string) => has(cell, 'valor');

/** Busca la fila de títulos y qué columna es cada cosa. */
export function detectColumns(t: Table): Columns | null {
  for (let r = 0; r < Math.min(t.length, 25); r++) {
    const row = t[r];
    const opDate = row.findIndex((c) => isDateHeader(c) && !isValueDate(c));
    const date = opDate >= 0 ? opDate : row.findIndex(isDateHeader);
    const concept = [['concepto'], ['descripcion'], ['movimiento'], ['detalle'], ['observaciones']].map((w) => row.findIndex((c) => has(c, ...w))).find((i) => i >= 0) ?? -1;
    const amount = row.findIndex((c) => has(c, 'importe', 'cantidad', 'monto') && !has(c, 'saldo'));
    const debit = row.findIndex((c) => has(c, 'cargo', 'debe', 'gasto', 'salida'));
    const credit = row.findIndex((c) => has(c, 'abono', 'haber', 'ingreso', 'entrada'));
    if (date >= 0 && concept >= 0 && (amount >= 0 || (debit >= 0 && credit >= 0))) {
      return { header: r, date, concept, ...(amount >= 0 ? { amount } : { debit, credit }) };
    }
  }
  // Sin títulos: por el contenido (fecha, texto e importe)
  const rows = t.slice(0, 40).filter((r) => r.length >= 3);
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const share = (test: (s: string) => boolean, c: number) => rows.filter((r) => r[c] !== undefined && test(r[c])).length / rows.length;
  const cols = Array.from({ length: width }, (_, c) => c);
  const date = cols.find((c) => share((s) => !!parseBankDate(s), c) > 0.6);
  const amount = cols.find((c) => c !== date && share((s) => parseBankAmount(s) !== null && /\d/.test(s), c) > 0.6);
  const concept = cols.find((c) => c !== date && c !== amount && share((s) => /[a-z]{3}/i.test(s), c) > 0.6);
  if (date === undefined || amount === undefined || concept === undefined) return null;
  return { header: -1, date, concept, amount };
}

/** «COMPRA TARJ. 4B1234XXXXXX5678 MERCADONA VALENCIA» → «Mercadona Valencia». */
export function cleanConcept(s: string): string {
  let t = s
    .replace(/\s+/g, ' ')
    .replace(/\b[0-9a-z]{2,8}[x*]{4,}\d{2,4}\b/gi, '')
    .replace(/\b(?:\d{4}\s?){3,4}\b/g, '')
    .replace(/^(?:compra|pago)\s+(?:con\s+)?(?:(?:tarj(?:eta)?\.?(?:\s+(?:cr[eé]dito|d[eé]bito))?|m[oó]vil)\s*)?(?:en\s+)?/i, '')
    .replace(/^(?:tarj(?:eta)?\.?)\s*/i, '')
    .replace(/\b\d{2}[/.-]\d{2}(?:[/.-]\d{2,4})?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t)) {
    const small = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'al', 'con', 'por', 'para']);
    t = t
      .toLowerCase()
      .split(' ')
      .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/^([a-záéíóúñ])/, (c) => c.toUpperCase()).replace(/-([a-záéíóúñ])/g, (_, c: string) => `-${c.toUpperCase()}`)))
      .join(' ');
  }
  return t || s.trim();
}

export interface ImportRow {
  key: string;
  date: ISODate;
  note: string;
  amount: number;
  kind: FinKind;
  category: string;
  /** Ya está apuntado (mismo día, importe y tipo). */
  duplicate: boolean;
}

export function toImportRows(t: Table, cols: Columns, existing: Movement[]): ImportRow[] {
  const out: ImportRow[] = [];
  const seen = new Map<string, number>();
  for (let r = cols.header + 1; r < t.length; r++) {
    const row = t[r];
    const date = parseBankDate(row[cols.date] ?? '');
    if (!date) continue;
    let value: number | null = null;
    if (cols.amount !== undefined) value = parseBankAmount(row[cols.amount] ?? '');
    else {
      const d = parseBankAmount(row[cols.debit!] ?? '');
      const c = parseBankAmount(row[cols.credit!] ?? '');
      value = c ? Math.abs(c) : d ? -Math.abs(d) : null;
    }
    if (!value) continue;
    const kind: FinKind = value < 0 ? 'gasto' : 'ingreso';
    const note = cleanConcept(row[cols.concept] ?? '');
    const amount = Math.abs(value);
    const base = `${date}|${amount}|${kind}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    // Duplicado si ya hay tantos o más movimientos iguales apuntados
    const same = existing.filter((m) => !m.deleted && m.date === date && m.kind === kind && Math.abs(m.amount - amount) < 0.005).length;
    out.push({
      key: `${base}|${n}|${r}`,
      date,
      note,
      amount,
      kind,
      category: guessCategory(note, kind) ?? (kind === 'gasto' ? 'otros' : 'otros-ingresos'),
      duplicate: same >= n,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
