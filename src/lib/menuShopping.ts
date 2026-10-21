import type { CustomFood, ListItem, Menu } from '../store/types';
import { menuOptions } from './diary';
import { parseFoodText } from './foodParse';
import { shopSection, SHOP_SECTIONS } from './listInput';
import { fold } from './quickParse';

export interface Ingredient {
  key: string;
  /** Cómo se apunta en la lista: «Pechuga de pollo». */
  text: string;
  /** «900 g», «1,2 kg», «6 uds», «1,5 l». */
  qty?: string;
  grams: number;
  section: string;
  /** Ya está en la lista de la compra (sin comprar). */
  inList: boolean;
  /** No se reconoce como alimento: va aparte, sin marcar. */
  unknown?: boolean;
}

const LIQUID = /leche|zumo|bebida|cerveza|vino|refresco|kefir|caldo|batido|horchata|cafe/;
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

/** «Arroz (crudo)» → «Arroz». */
const shoppingName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim();

/** Lo cocinado se compra en crudo (y suma con lo crudo): clave, nombre y cuánto pesa en crudo. */
const AS_BOUGHT: Record<string, [string, string, number]> = {
  'arroz-cocido': ['arroz', 'Arroz', 1 / 2.8],
  'pasta-cocida': ['pasta', 'Pasta', 1 / 2.4],
  'lentejas-cocidas': ['lentejas', 'Lentejas', 1 / 2.5],
  'garbanzos-cocidos': ['garbanzos', 'Garbanzos', 1 / 2.4],
  'alubias-cocidas': ['alubias', 'Alubias', 1 / 2.4],
  'quinoa-cocida': ['quinoa', 'Quinoa', 1 / 2.7],
  'cafe-con-leche': ['leche', 'Leche', 0.8],
};

/** Dos palabras son la misma aunque una esté en plural (tomate/tomates, limón/limones, nuez/nueces). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return l === `${s}s` || l === `${s}es` || (s.endsWith('z') && l === `${s.slice(0, -1)}ces`);
}

/** ¿Es lo mismo en la lista? Sin tildes, mayúsculas ni plurales («Tomates» = «tomate»). */
export function sameItem(a: string, b: string): boolean {
  const wa = fold(a).trim().split(/\s+/);
  const wb = fold(b).trim().split(/\s+/);
  return wa.length === wb.length && wa.every((w, i) => sameWord(w, wb[i]));
}

function quantity(name: string, grams: number, unitGrams?: number, section?: string): string | undefined {
  if (grams <= 0) return undefined;
  // Por unidades lo que se compra así (huevos, yogures, aguacates…); la carne y el pescado, al peso.
  if (unitGrams && unitGrams >= 20 && unitGrams <= 150 && section !== 'carne' && section !== 'pan') {
    const n = Math.round(grams / unitGrams);
    if (n >= 1) return `${n} ${n === 1 ? 'ud' : 'uds'}`;
  }
  const liquid = LIQUID.test(fold(name));
  if (grams >= 1000) return `${nf.format(Math.round(grams / 100) / 10)} ${liquid ? 'l' : 'kg'}`;
  return `${Math.round(grams / 10) * 10 || Math.round(grams)} ${liquid ? 'ml' : 'g'}`;
}

/**
 * Los ingredientes del menú de unos días, sumando lo que se repite, en el orden
 * del súper. Lo que ya está en la lista se marca para no duplicarlo.
 */
export function menuIngredients(menu: Menu, days: number[], custom: CustomFood[], list: ListItem[]): Ingredient[] {
  const byKey = new Map<string, Ingredient & { unitGrams?: number }>();
  const unknown = new Map<string, string>();
  for (const d of days) {
    const day = menu.days[d] ?? {};
    for (const text of Object.values(day)) {
      for (const line of menuOptions(text)) {
        for (const p of parseFoodText(line, custom)) {
          if (!p.food) {
            const src = p.source.replace(/^\s*(?:y|con|de)\s+/i, '').trim();
            if (src.length > 2) unknown.set(fold(src), src.charAt(0).toUpperCase() + src.slice(1));
            continue;
          }
          if (p.food.key === 'agua') continue;
          const [key, name, factor] = AS_BOUGHT[p.food.key] ?? [p.food.key, shoppingName(p.food.name), 1];
          const grams = p.grams * factor;
          const cur = byKey.get(key);
          if (cur) cur.grams += grams;
          else byKey.set(key, { key, text: name, grams, section: shopSection(name), inList: false, unitGrams: AS_BOUGHT[p.food.key] ? undefined : p.food.units.unidad });
        }
      }
    }
  }
  const pendingTexts = list.filter((i) => i.list === 'compra' && !i.done && !i.deleted).map((i) => i.text);
  const inList = (text: string) => pendingTexts.some((t) => sameItem(t, text));
  const order = (s: string) => SHOP_SECTIONS.findIndex((x) => x.key === s);
  const known = [...byKey.values()].map(({ unitGrams, ...i }) => ({ ...i, qty: quantity(i.text, i.grams, unitGrams, i.section), inList: inList(i.text) }));
  known.sort((a, b) => order(a.section) - order(b.section) || a.text.localeCompare(b.text, 'es'));
  const rest = [...unknown]
    .filter(([k]) => !known.some((i) => fold(i.text) === k))
    .map(([k, text]) => ({ key: `?${k}`, text, grams: 0, section: shopSection(text), inList: inList(text), unknown: true }));
  return [...known, ...rest];
}
