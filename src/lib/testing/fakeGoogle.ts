import { createHash } from 'node:crypto';
import { appsScriptCode, serverScriptCode } from '../shareScript';

/* Simulador de Google Sheets + Apps Script para las pruebas: ejecuta el código real de la hoja. */

type Cell = string | number | boolean;

/** Un libro de cálculo (sus pestañas) con lo que usa el código de la hoja. */
function fakeBook() {
  const sheets: Record<string, Cell[][]> = {};
  const formats: string[] = [];
  /** Cuántas veces se ha leído cada pestaña entera. */
  const reads: Record<string, number> = {};
  // Como en Sheets: el apóstrofo inicial solo evita fórmulas, no se guarda.
  const clean = (row: Cell[]) => row.map((v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v));
  const sheet = (name: string) => ({
    getName: () => name,
    appendRow: (row: Cell[]) => void sheets[name].push(clean(row)),
    getDataRange: () => ({
      getValues: () => {
        reads[name] = (reads[name] ?? 0) + 1;
        return sheets[name].map((r) => [...r]);
      },
    }),
    getLastColumn: () => Math.max(0, ...sheets[name].map((r) => r.length)),
    getRange: (a: string | number, _col?: number, rows = 1, cols = 1) =>
      typeof a === 'string'
        ? { setNumberFormat: (f: string) => void formats.push(`${a}=${f}`) }
        : {
            setValues: (vals: Cell[][]) => void (sheets[name][a - 1] = clean(vals[0])),
            getValues: () => sheets[name].slice(a - 1, a - 1 + rows).map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? '')),
          },
    setFrozenRows: () => undefined,
    deleteRow: (row: number) => void sheets[name].splice(row - 1, 1),
  });
  const book = {
    getSheetByName: (n: string) => (sheets[n] ? sheet(n) : null),
    getSheets: () => Object.keys(sheets).map(sheet),
    insertSheet: (n: string) => {
      sheets[n] = [];
      return sheet(n);
    },
  };
  return { sheets, formats, reads, book };
}

const LockService = { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) };
const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: (text: string) => ({ setMimeType: () => ({ getContent: () => text }) }),
};
type Handlers = { doGet: (e: unknown) => { getContent: () => string }; doPost: (e: unknown) => { getContent: () => string } };

/** Lo que hace la aplicación web publicada: GET/POST sin cabeceras a su dirección /exec. */
function webApp(url: string, fns: Handlers) {
  let calls = 0;
  const fetchImpl = async (u: string, init: RequestInit = {}) => {
    calls++;
    if (!u.startsWith(url)) throw new TypeError('Failed to fetch');
    // Sin cabeceras propias: evita la consulta previa CORS que Apps Script no contesta.
    if (init.headers !== undefined) throw new Error('La petición lleva cabeceras propias');
    const out =
      init.method === 'POST'
        ? fns.doPost({ postData: { contents: String(init.body) } })
        : fns.doGet({ parameter: Object.fromEntries(new URL(u).searchParams) });
    return new Response(out.getContent(), { status: 200 });
  };
  return { fetchImpl, calls: () => calls };
}

/** Una hoja vuestra (la forma avanzada), con la clave dentro del código. */
export function fakeGoogle(key = 'CLAVE123') {
  const { sheets, formats, reads, book } = fakeBook();
  const SpreadsheetApp = { getActiveSpreadsheet: () => book };
  const fns = new Function('SpreadsheetApp', 'LockService', 'ContentService', `${appsScriptCode(key)}\nreturn { doGet, doPost };`)(
    SpreadsheetApp,
    LockService,
    ContentService,
  ) as Handlers;
  const URL_ = 'https://script.google.com/macros/s/AKfy_test/exec';
  const app = webApp(URL_, fns);
  return { sheets, formats, reads, fetchImpl: app.fetchImpl, share: { url: URL_, key }, calls: app.calls };
}

/** El servidor de la app: varios hogares, cada uno con su libro, con el código real del servidor. */
export function fakeServer() {
  const books = new Map<string, ReturnType<typeof fakeBook> & { title: string }>();
  const props = new Map<string, string>();
  const cache = new Map<string, string>();
  const withId = (id: string) => ({ ...books.get(id)!.book, getId: () => id });
  const SpreadsheetApp = {
    create: (title: string) => {
      const id = `libro${books.size + 1}`;
      books.set(id, { ...fakeBook(), title });
      return withId(id);
    },
    openById: (id: string) => {
      if (!books.has(id)) throw new Error('No existe el libro');
      return withId(id);
    },
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k: string) => props.get(k) ?? null,
      setProperty: (k: string, v: string) => void props.set(k, String(v)),
      setProperties: (o: Record<string, string>) => Object.entries(o).forEach(([k, v]) => props.set(k, String(v))),
    }),
  };
  const CacheService = { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => void cache.set(k, v) }) };
  // Como en Apps Script: los bytes del resumen vienen con signo (-128…127).
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_alg: string, text: string) => [...createHash('sha256').update(text, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
  };
  const fns = new Function(
    'SpreadsheetApp',
    'LockService',
    'ContentService',
    'PropertiesService',
    'CacheService',
    'Utilities',
    `${serverScriptCode()}\nreturn { doGet, doPost };`,
  )(SpreadsheetApp, LockService, ContentService, PropertiesService, CacheService, Utilities) as Handlers;
  const URL_ = 'https://script.google.com/macros/s/AKfy_server/exec';
  const app = webApp(URL_, fns);
  return { books, props, cache, url: URL_, fetchImpl: app.fetchImpl, calls: app.calls };
}
