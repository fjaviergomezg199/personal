import type { CustomFood } from '../store/types';
import { allFoods, type FoodRef } from './foods';
import { fold } from './quickParse';

/**
 * «150 g de pechuga de pollo con 80 g de arroz y 1 cucharada de aceite»
 * → pollo 150 g, arroz 80 g, aceite 10 g. Si no hay cantidad, se estima una
 * ración y se marca para que la persona la confirme.
 */
export interface ParsedFood {
  food?: FoodRef;
  grams: number;
  estimated: boolean;
  /** Texto original reconocido (o desconocido). */
  source: string;
}

const NUM_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, medio: 0.5, media: 0.5, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', ml: 'ml', cl: 'cl', l: 'l', litro: 'l', litros: 'l',
  cda: 'cucharada', cdas: 'cucharada', cdta: 'cucharadita', cdtas: 'cucharadita', ud: 'unidad', uds: 'unidad', pieza: 'unidad', piezas: 'unidad',
  scoop: 'scoop', scoops: 'scoop', cacito: 'scoop', cacitos: 'scoop', medida: 'scoop', medidas: 'scoop', cazo: 'scoop', cazos: 'scoop',
};

/** Pesos por defecto si el alimento no tiene esa unidad. */
const GENERIC_UNITS: Record<string, number> = {
  cucharada: 12, cucharadita: 5, vaso: 200, taza: 200, punado: 30, rebanada: 30, tostada: 30, loncha: 15, lata: 80, scoop: 30, onza: 10,
  porcion: 100, racion: 150, plato: 250, copa: 150, cana: 200, tercio: 330, chorrito: 5, pizca: 1, bol: 250, bola: 50, rodaja: 30,
  tajada: 200, sobre: 8, tarrina: 125, bote: 250, brick: 1000, pincho: 120, trozo: 60, tableta: 100, botella: 500, botellin: 250, filete: 120,
};

const UNIT_WORDS =
  'g|gr|grs|gramos?|kg|kilos?|ml|cl|l|litros?|cucharadas?|cucharaditas?|cdas?|cdtas?|vasos?|tazas?|punados?|rebanadas?|tostadas?|lonchas?|latas?|unidades|unidad|uds?|piezas?|filetes?|scoops?|cacitos?|onzas?|porcion(?:es)?|racion(?:es)?|platos?|copas?|canas?|tercios?|chorritos?|pizcas?|bol(?:es)?|cazos?|bolas?|rodajas?|tajadas?|sobres?|tarrinas?|botes?|bricks?|medidas?|pinchos?|trozos?|tabletas?|botellas?|botellines?|racimos?|vasitos?';
const NUMBER = '(\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?|\\d+\\/\\d+|una|uno|un|medio|media|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
const ADJ = '(?:sopera|soperas|pequena|pequenas|pequeno|pequenos|grande|grandes|colmada|colmadas|rasa|rasas|mediana|medianas|mediano|medianos|de postre|generosa|generoso)';
const PRE_RE = new RegExp(`(?:^|[\\s(])${NUMBER}\\s*(${UNIT_WORDS})?\\.?\\s*(?:${ADJ}\\s*)?(?:de\\s+)?(?:la\\s+|el\\s+|los\\s+|las\\s+)?$`);
const POST_RE = new RegExp(`^\\s*[(:,-]?\\s*(?:${NUMBER}\\s*(g|gr|grs|gramos|ml|kg|cl|l)\\b|x\\s?(\\d+)\\b)`);

/** Palabras que no son alimentos (para no marcar como desconocido). */
const FILLER = new Set(
  (
    'a al la el los las de del en con sin y o u e ni para por mas al gusto gusto poco poca algo unos unas un una uno medio media ' +
    'plancha horno hervido hervida hervidos hervidas cocido cocida cocidos cocidas asado asada asados asadas frito frita fritos fritas ' +
    'salteado salteada salteados salteadas vapor crudo cruda crudos crudas natural naturales casero casera caseros caseras fresco fresca ' +
    'frescos frescas troceado troceada picado picada rallado rallada integral integrales light desnatado desnatada entero entera pequeno ' +
    'pequena grande mediano mediana opcional racion cantidad libre aliñado alinado aliñada alinada sopera cucharada cucharadas cucharadita ' +
    'vaso taza punado rebanada loncha lata unidad unidades plato bol pizca chorrito g gr gramos ml kg l sal pimienta especias oregano comino ' +
    'perejil limon vinagre ajo hierbas aromaticas edulcorante sacarina stevia hielo agua tipo estilo y/o ademas acompanado acompanada ' +
    'guarnicion cena comida desayuno merienda almuerzo opcion opciones o bien semana dia dias mismo misma'
  ).split(/\s+/),
);

/** Platos genéricos que, seguidos de «de X», solo describen a X («ensalada de tomate»). */
const GENERIC = new Set(['ensalada', 'verduras', 'fruta', 'sopa', 'lechuga']);

interface Syn {
  syn: string;
  food: FoodRef;
}

function buildIndex(foods: FoodRef[]): Map<string, Syn[]> {
  const byFirst = new Map<string, Syn[]>();
  for (const food of foods) {
    for (const s of new Set([food.name, ...food.synonyms].map((x) => fold(x).replace(/\s*\(.*\)$/, '').trim()))) {
      if (!s) continue;
      const first = s.split(' ')[0];
      const list = byFirst.get(first) ?? [];
      list.push({ syn: s, food });
      byFirst.set(first, list);
    }
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.syn.length - a.syn.length);
  return byFirst;
}

let cache: { key: string; index: Map<string, Syn[]> } | null = null;

function indexFor(custom: CustomFood[]): Map<string, Syn[]> {
  const key = custom.map((c) => c.id + c.name).join('|');
  if (!cache || cache.key !== key) cache = { key, index: buildIndex(allFoods(custom)) };
  return cache.index;
}

const isWordChar = (c: string | undefined) => !!c && /[a-z0-9ñ]/.test(c);

function parseNumber(s: string): number {
  if (NUM_WORDS[s] !== undefined) return NUM_WORDS[s];
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const range = /^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/.exec(s);
  if (range) return (Number(range[1].replace(',', '.')) + Number(range[2].replace(',', '.'))) / 2;
  return Number(s.replace(',', '.'));
}

function singular(u: string): string {
  if (UNIT_ALIASES[u]) return UNIT_ALIASES[u];
  if (u === 'unidades') return 'unidad';
  if (/(?:on|or)es$/.test(u)) return u.slice(0, -2);
  if (u === 'boles') return 'bol';
  if (u.endsWith('s')) return u.slice(0, -1);
  return u;
}

function unitGrams(food: FoodRef, unit: string): number {
  const units = Object.fromEntries(Object.entries(food.units).map(([k, v]) => [fold(k), v]));
  if (units[unit] !== undefined) return units[unit];
  if (unit === 'unidad') return units.unidad ?? food.portion;
  return GENERIC_UNITS[unit] ?? food.portion;
}

function gramsFor(food: FoodRef, n: number, rawUnit: string | undefined): number {
  if (!rawUnit) {
    const units = Object.fromEntries(Object.entries(food.units).map(([k, v]) => [fold(k), v]));
    if (units.unidad !== undefined) return n * units.unidad;
    return n >= 10 ? n : n * food.portion;
  }
  const u = singular(rawUnit);
  switch (u) {
    case 'g':
    case 'ml':
      return n;
    case 'kg':
    case 'l':
      return n * 1000;
    case 'cl':
      return n * 10;
    default:
      return n * unitGrams(food, u);
  }
}

export function parseFoodText(text: string, custom: CustomFood[] = []): ParsedFood[] {
  const f = fold(text);
  const index = indexFor(custom);

  // 1) Menciones de alimentos (de izquierda a derecha, la más larga en cada sitio)
  const mentions: { start: number; end: number; food: FoodRef }[] = [];
  let i = 0;
  while (i < f.length) {
    if (!isWordChar(f[i]) || isWordChar(f[i - 1])) {
      i++;
      continue;
    }
    const word = /^[a-z0-9ñ]+/.exec(f.slice(i))?.[0] ?? '';
    const variants = Array.from(new Set([word, word.replace(/s$/, ''), word.replace(/es$/, '')]));
    const candidates = variants.flatMap((v) => index.get(v) ?? []).sort((a, b) => b.syn.length - a.syn.length);
    let hit: { end: number; food: FoodRef } | null = null;
    for (const c of candidates) {
      if (!f.startsWith(c.syn, i)) {
        // plural de la primera palabra: «pechugas de pollo»
        continue;
      }
      let end = i + c.syn.length;
      const plural = /^(es|s)(?![a-z0-9ñ])/.exec(f.slice(end));
      if (plural) end += plural[1].length;
      if (isWordChar(f[end])) continue;
      hit = { end, food: c.food };
      break;
    }
    if (!hit) {
      // Plural en la primera palabra de un sinónimo de varias palabras: «pechugas de pollo»
      outer: for (const sing of variants.slice(1)) {
        for (const c of index.get(sing) ?? []) {
          const rest = c.syn.slice(sing.length);
          if (rest && f.startsWith(word + rest, i) && !isWordChar(f[i + word.length + rest.length])) {
            hit = { end: i + word.length + rest.length, food: c.food };
            break outer;
          }
        }
      }
    }
    if (hit) {
      mentions.push({ start: i, end: hit.end, food: hit.food });
      i = hit.end;
    } else i += Math.max(1, word.length);
  }

  // «ensalada de tomate» → solo tomate
  const kept = mentions.filter((m, k) => {
    const next = mentions[k + 1];
    return !(GENERIC.has(m.food.key) && next && /^\s+de\s+$/.test(f.slice(m.end, next.start)));
  });

  // 2) Cantidades
  const out: { pos: number; item: ParsedFood }[] = [];
  const used: [number, number][] = [];
  kept.forEach((m, k) => {
    const prevEnd = k > 0 ? kept[k - 1].end : 0;
    const nextStart = k < kept.length - 1 ? kept[k + 1].start : f.length;
    const before = f.slice(prevEnd, m.start);
    const seg = before.split(/[,;+\n]|\s(?:y|con|mas)\s/).pop() ?? '';
    const segStart = m.start - seg.length;
    let grams: number | null = null;
    let qStart = m.start;
    let qEnd = m.end;
    const pre = PRE_RE.exec(seg);
    if (pre) {
      grams = gramsFor(m.food, parseNumber(pre[1]), pre[2]);
      qStart = segStart + pre.index;
    }
    const after = f.slice(m.end, nextStart);
    const post = POST_RE.exec(after);
    if (post && grams === null) {
      grams = post[3] ? gramsFor(m.food, Number(post[3]), undefined) : gramsFor(m.food, parseNumber(post[1]), post[2]);
      qEnd = m.end + post[0].length;
    }
    const estimated = grams === null;
    if (grams === null) grams = m.food.portion;
    used.push([qStart, qEnd]);
    out.push({ pos: m.start, item: { food: m.food, grams: Math.round(grams * 10) / 10, estimated, source: text.slice(qStart, qEnd).trim() } });
  });

  // 3) Trozos sin ningún alimento conocido
  const sepRe = /[,;+\n]|\s(?:y|con|mas)\s/g;
  let last = 0;
  const pieces: [number, number][] = [];
  let sm: RegExpExecArray | null;
  while ((sm = sepRe.exec(f))) {
    pieces.push([last, sm.index]);
    last = sm.index + sm[0].length;
  }
  pieces.push([last, f.length]);
  for (const [a, b] of pieces) {
    if (used.some(([x, y]) => x < b && y > a)) continue;
    const words = f
      .slice(a, b)
      .replace(/[^a-z0-9ñ/ ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w) && !/^\d/.test(w) && !new RegExp(`^(?:${UNIT_WORDS})$`).test(w));
    if (words.some((w) => w.length >= 3)) out.push({ pos: a, item: { grams: 0, estimated: true, source: text.slice(a, b).trim() } });
  }

  return out.sort((x, y) => x.pos - y.pos).map((x) => x.item);
}
