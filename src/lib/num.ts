/** Números a la española: «72,4», «1240». */
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export const fmt0 = (n: number) => nf0.format(Math.round(n));
export const fmt1 = (n: number) => nf1.format(Math.round(n * 10) / 10);

const fixed = new Map<number, Intl.NumberFormat>();
/** Con un número fijo de decimales (medidas: «72,0 kg»). */
export function fmtFixed(n: number, decimals: number): string {
  let f = fixed.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    fixed.set(decimals, f);
  }
  return f.format(n);
}

/** «72,4», «72.4» o « 150 » → número; vacío o no válido → null. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Para rellenar un campo de texto: 72.4 → «72,4». */
export const toInput = (n: number | undefined | null) => (n === undefined || n === null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));
