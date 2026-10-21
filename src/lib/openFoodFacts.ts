/**
 * Búsqueda de productos del súper en Open Food Facts (base de datos abierta).
 * Solo funciona con conexión; si falla, la app sigue con su base propia.
 */
export interface OffProduct {
  code: string;
  name: string;
  brand?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingGrams?: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const r1 = (x: number) => Math.round(x * 10) / 10;

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function toOffProduct(p: Record<string, unknown>): OffProduct | null {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kj = num(n['energy_100g']) ?? num(n['energy-kj_100g']);
  const kcal = num(n['energy-kcal_100g']) ?? (kj !== undefined ? kj / 4.184 : undefined);
  const name = String(p.product_name_es || p.product_name || '').trim();
  if (kcal === undefined || !name) return null;
  return {
    code: String(p.code ?? ''),
    name,
    brand: String(p.brands ?? '').split(',')[0].trim() || undefined,
    kcal: Math.round(kcal),
    protein: r1(num(n['proteins_100g']) ?? 0),
    carbs: r1(num(n['carbohydrates_100g']) ?? 0),
    fat: r1(num(n['fat_100g']) ?? 0),
    servingGrams: num(p.serving_quantity),
  };
}

const FIELDS = 'code,product_name,product_name_es,brands,nutriments,serving_quantity';

export async function searchOpenFoodFacts(query: string, fetchImpl: FetchLike = fetch): Promise<OffProduct[]> {
  const q = query.trim();
  if (/^\d{8,14}$/.test(q)) {
    const res = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${FIELDS}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    const p = data.status === 1 && data.product ? toOffProduct({ code: q, ...data.product }) : null;
    return p ? [p] : [];
  }
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '24',
    fields: FIELDS,
    lc: 'es',
    cc: 'es',
  });
  const res = await fetchImpl(`https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`);
  if (!res.ok) throw new Error(`Open Food Facts respondió ${res.status}`);
  const data = (await res.json()) as { products?: Record<string, unknown>[] };
  return (data.products ?? []).map(toOffProduct).filter((x): x is OffProduct => !!x);
}
