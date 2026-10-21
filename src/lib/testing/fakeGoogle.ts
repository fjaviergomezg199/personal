import { appsScriptCode } from '../shareScript';

/* Simulador de Google Sheets + Apps Script para las pruebas: ejecuta el código real de la hoja. */

type Cell = string | number | boolean;

export function fakeGoogle(key = 'CLAVE123') {
  const sheets: Record<string, Cell[][]> = {};
  const formats: string[] = [];
  /** Cuántas veces se ha leído cada pestaña entera. */
  const reads: Record<string, number> = {};
  let calls = 0;
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
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n: string) => (sheets[n] ? sheet(n) : null),
      getSheets: () => Object.keys(sheets).map(sheet),
      insertSheet: (n: string) => {
        sheets[n] = [];
        return sheet(n);
      },
    }),
  };
  const LockService = { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) };
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (text: string) => ({ setMimeType: () => ({ getContent: () => text }) }),
  };
  const fns = new Function('SpreadsheetApp', 'LockService', 'ContentService', `${appsScriptCode(key)}\nreturn { doGet, doPost };`)(
    SpreadsheetApp,
    LockService,
    ContentService,
  ) as { doGet: (e: unknown) => { getContent: () => string }; doPost: (e: unknown) => { getContent: () => string } };

  const URL_ = 'https://script.google.com/macros/s/AKfy_test/exec';
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    calls++;
    if (!url.startsWith(URL_)) throw new TypeError('Failed to fetch');
    // Sin cabeceras propias: evita la consulta previa CORS que Apps Script no contesta.
    if (init.headers !== undefined) throw new Error('La petición lleva cabeceras propias');
    const out =
      init.method === 'POST'
        ? fns.doPost({ postData: { contents: String(init.body) } })
        : fns.doGet({ parameter: Object.fromEntries(new URL(url).searchParams) });
    return new Response(out.getContent(), { status: 200 });
  };
  return { sheets, formats, reads, fetchImpl, share: { url: URL_, key }, calls: () => calls };
}
