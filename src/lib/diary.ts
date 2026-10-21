import type { CustomFood, FoodLogItem } from '../store/types';
import { parseFoodText } from './foodParse';
import { findFood, type FoodRef } from './foods';
import { DEFAULT_MEALS } from './importers';
import { fold } from './quickParse';

/** Comidas del día: las del menú del área y, al final, las que solo aparezcan en lo apuntado. */
export function mealsForDay(menuMeals: string[] | undefined, logs: FoodLogItem[]): string[] {
  const base = menuMeals?.length ? menuMeals : DEFAULT_MEALS;
  const extra = logs.map((l) => l.meal).filter((m) => !base.includes(m));
  return [...base, ...new Set(extra)];
}

/** Hora típica de cada comida, para proponer la que toca ahora. */
const MEAL_CENTERS: [RegExp, number][] = [
  [/desayuno/, 8.5],
  [/media manana|almuerzo|tentempie/, 11.5],
  [/comida/, 14.5],
  [/merienda/, 17.5],
  [/recena/, 23],
  [/cena/, 21],
];

export function mealForNow(meals: string[], now: Date = new Date()): string {
  const h = now.getHours() + now.getMinutes() / 60;
  let best = meals[0];
  let bestDist = Infinity;
  for (const m of meals) {
    const center = MEAL_CENTERS.find(([re]) => re.test(fold(m)))?.[1];
    if (center === undefined) continue;
    const dist = Math.abs(center - h);
    if (dist < bestDist) {
      best = m;
      bestDist = dist;
    }
  }
  return best;
}

/** Las opciones de una comida del menú (una por línea), sin «Opción 1:» ni viñetas. */
export function menuOptions(text: string): string[] {
  return text
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, '')
        .replace(/^\s*opci[oó]n\s*(?:\d+|[a-z])?\s*[:.)-]\s*/i, '')
        .trim(),
    )
    .filter((l) => l.length > 1);
}

/**
 * Lo que lleva una comida del menú, para apuntarla de un toque. null si hay que
 * elegir (opciones) o si algo no se reconoce: entonces se abre la hoja de apuntar.
 */
export function menuMealItems(text: string, custom: CustomFood[]): { food: FoodRef; grams: number }[] | null {
  if (menuHasAlternatives(text)) return null;
  const parsed = parseFoodText(menuOptions(text).join('\n'), custom);
  if (!parsed.length || parsed.some((p) => !p.food)) return null;
  const items = parsed.filter((p) => p.grams > 0).map((p) => ({ food: p.food!, grams: p.grams }));
  return items.length ? items : null;
}

/** ¿Las líneas son opciones a elegir («Opción 1: …») o partes de la misma comida? */
export function menuHasAlternatives(text: string): boolean {
  return /\bopci[oó]n(?:es)?\b|^\s*o\s+bien\b/im.test(text);
}

/** «2 yogures proteicos» → «yogures proteicos» (para poner nombre a un alimento nuevo). */
export function stripQuantity(text: string): string {
  const out = text
    .trim()
    .replace(
      /^(?:\d+(?:[.,]\d+)?|un|una|uno|medio|media|dos|tres|cuatro)(?:\s*(?:g|gr|gramos|ml|kg|l|cl|x|uds?|unidad(?:es)?|vasos?|tazas?|latas?|botellas?|botes?|cucharadas?|cucharaditas?|puñados?|rebanadas?|lonchas?|platos?|bol(?:es)?|raci[oó]n(?:es)?|trozos?|piezas?|scoops?|cacitos?)\.?)?\s+(?:de\s+)?/i,
      '',
    )
    .trim();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
}

/** Lo último que se ha apuntado (sin repetir), con la cantidad de la última vez. */
export function recentFoods(log: FoodLogItem[], custom: CustomFood[], limit = 12): { food: FoodRef; grams: number }[] {
  const seen = new Set<string>();
  const out: { food: FoodRef; grams: number }[] = [];
  const sorted = [...log].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const l of sorted) {
    const k = l.foodId ?? fold(l.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ food: findFood(l.foodId, custom) ?? logToRef(l), grams: l.grams });
    if (out.length >= limit) break;
  }
  return out;
}

/** Un alimento «al vuelo» a partir de algo apuntado (si ya no está en la base). */
export function logToRef(l: FoodLogItem): FoodRef {
  const k = l.grams > 0 ? 100 / l.grams : 0;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    key: `log:${l.id}`,
    name: l.name,
    kcal: Math.round(l.kcal * k),
    protein: r1(l.protein * k),
    carbs: r1(l.carbs * k),
    fat: r1(l.fat * k),
    portion: l.grams || 100,
    units: {},
    synonyms: [l.name],
  };
}
