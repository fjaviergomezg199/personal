import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Movement } from '../store/types';
import { cleanConcept, decodeText, detectColumns, parseBankAmount, parseBankDate, parseDelimited, readXlsx, toImportRows } from './bankImport';

/** Un .xlsx mínimo hecho a mano (zip con deflate), como los que da el banco. */
function makeXlsx(rows: (string | number)[][]): ArrayBuffer {
  const shared: string[] = [];
  const sheetRows = rows
    .map((r, i) => `<row r="${i + 1}">${r
      .map((v, j) => {
        const ref = `${String.fromCharCode(65 + j)}${i + 1}`;
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
        shared.push(v);
        return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
      })
      .join('')}</row>`)
    .join('');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const files: [string, string][] = [
    ['xl/workbook.xml', '<workbook/>'],
    ['xl/sharedStrings.xml', `<sst>${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`],
    ['xl/worksheets/sheet1.xml', `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`],
  ];
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = deflateRawSync(Buffer.from(text));
    const nameB = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameB.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(Buffer.byteLength(text), 24);
    cen.writeUInt16LE(nameB.length, 28);
    cen.writeUInt32LE(offset, 42);
    chunks.push(local, nameB, data);
    central.push(cen, nameB);
    offset += local.length + nameB.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...chunks, cenBuf, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

describe('importar del banco', () => {
  it('fechas e importes a la española', () => {
    expect(parseBankDate('21/10/2026')).toBe('2026-10-21');
    expect(parseBankDate('5-1-26')).toBe('2026-01-05');
    expect(parseBankDate('2026-10-21')).toBe('2026-10-21');
    expect(parseBankDate('46316')).toBe('2026-10-21'); // serie de Excel
    expect(parseBankDate('Mercadona')).toBeNull();
    expect(parseBankAmount('-12,50')).toBe(-12.5);
    expect(parseBankAmount('−1.234,56 €')).toBe(-1234.56);
    expect(parseBankAmount('2.100,00')).toBe(2100);
    expect(parseBankAmount('-9.99')).toBe(-9.99);
    expect(parseBankAmount('(45,30)')).toBe(-45.3);
    expect(parseBankAmount('1,234.50')).toBe(1234.5);
    expect(parseBankAmount('abc')).toBeNull();
  });

  it('limpia los conceptos del banco', () => {
    expect(cleanConcept('COMPRA TARJ. 4B1234XXXXXX5678 MERCADONA VALENCIA')).toBe('Mercadona Valencia');
    expect(cleanConcept('PAGO MOVIL EN REPSOL 20/10')).toBe('Repsol');
    expect(cleanConcept('Transferencia de Leyre')).toBe('Transferencia de Leyre');
    expect(cleanConcept('BIZUM DE LEYRE')).toBe('Bizum de Leyre');
  });

  it('CSV en Windows-1252 con líneas antes de los títulos', () => {
    const csv = 'Cuenta;ES12 3456\nTitular;Javi\n\nFecha;Fecha valor;Concepto;Importe;Saldo\n20/10/2026;20/10/2026;COMPRA TARJ. 1234XXXXXXXX5678 MERCADONA;-45,30;1.954,70\n19/10/2026;19/10/2026;CAÑAS BAR PEPE;-12,50;2.000,00\n25/09/2026;25/09/2026;NOMINA SEPTIEMBRE;2.100,00;2.012,50\n';
    const bytes = Uint8Array.from([...csv].map((c) => (c === 'Ñ' ? 0xd1 : c.charCodeAt(0))));
    const text = decodeText(bytes.buffer);
    expect(text).toContain('CAÑAS');
    const t = parseDelimited(text);
    const cols = detectColumns(t)!;
    expect(cols).toEqual({ header: 2, date: 0, concept: 2, amount: 3 }); // la línea en blanco no cuenta
    const existing = [{ id: 'x', scope: 'personal', kind: 'gasto', date: '2026-10-19', amount: 12.5, category: 'restaurantes', updatedAt: 1 }] as Movement[];
    const rows = toImportRows(t, cols, existing);
    expect(rows.map((r) => [r.date, r.note, r.amount, r.kind, r.category, r.duplicate])).toEqual([
      ['2026-10-20', 'Mercadona', 45.3, 'gasto', 'super', false],
      ['2026-10-19', 'Cañas Bar Pepe', 12.5, 'gasto', 'restaurantes', true],
      ['2026-09-25', 'Nomina Septiembre', 2100, 'ingreso', 'nomina', false],
    ]);
  });

  it('columnas de cargo y abono, y filas pegadas desde Excel', () => {
    const t = parseDelimited('F. Operación\tDescripción\tCargo\tAbono\n21/10/2026\tGASOLINA CEPSA\t60,00\t\n20/10/2026\tBizum de Leyre\t\t25,00\n');
    const cols = detectColumns(t)!;
    expect(cols).toMatchObject({ date: 0, concept: 1, debit: 2, credit: 3 });
    expect(toImportRows(t, cols, []).map((r) => [r.note, r.kind, r.amount, r.category])).toEqual([
      ['Gasolina Cepsa', 'gasto', 60, 'transporte'],
      ['Bizum de Leyre', 'ingreso', 25, 'extra'],
    ]);
  });

  it('Excel (.xlsx) con fechas como número de serie', async () => {
    const buf = makeXlsx([
      ['Movimientos de la cuenta'],
      ['Fecha', 'Concepto', 'Importe (€)', 'Saldo'],
      [46316, 'NETFLIX.COM', -13.99, 1500],
      [46315, 'Farmacia & Parafarmacia', -8.4, 1513.99],
    ]);
    const t = await readXlsx(buf);
    expect(t[2]).toEqual(['46316', 'NETFLIX.COM', '-13.99', '1500']);
    const rows = toImportRows(t, detectColumns(t)!, []);
    expect(rows.map((r) => [r.date, r.note, r.amount, r.category])).toEqual([
      ['2026-10-21', 'Netflix.com', 13.99, 'suscripciones'],
      ['2026-10-20', 'Farmacia & Parafarmacia', 8.4, 'salud'],
    ]);
  });
});
