import { fold } from './quickParse';

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const UNIT =
  '(?:kg|kilos?|g|gr|gramos|l|litros?|ml|uds?\\.?|unidades|paquetes?|latas?|botes?|bricks?|docenas?|bolsas?|cajas?|botellas?|tarrinas?|barras?|mallas?)';

/** «2 kg naranjas, leche x6, pan» → elementos con cantidad. */
export function parseListInput(text: string): { text: string; qty?: string }[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      let m = new RegExp(`^(\\d+(?:[.,]\\d+)?\\s*${UNIT}?)\\s+(?:de\\s+)?(.+)$`, 'i').exec(s);
      if (m) return { qty: m[1].replace(/\s+/g, ' ').trim(), text: cap(m[2].trim()) };
      m = new RegExp(`^(.+?)\\s+(?:x\\s?(\\d+)|(\\d+(?:[.,]\\d+)?\\s*${UNIT}))$`, 'i').exec(s);
      if (m) return { qty: (m[2] ?? m[3]).trim(), text: cap(m[1].trim()) };
      return { text: cap(s) };
    });
}

export interface ShopSection {
  key: string;
  label: string;
}

export const SHOP_SECTIONS: ShopSection[] = [
  { key: 'fruta', label: '🥬 Fruta y verdura' },
  { key: 'pan', label: '🥖 Panadería' },
  { key: 'carne', label: '🥩 Carne y pescado' },
  { key: 'lacteos', label: '🧀 Lácteos y huevos' },
  { key: 'despensa', label: '🥫 Despensa' },
  { key: 'congelados', label: '❄️ Congelados' },
  { key: 'bebidas', label: '🥤 Bebidas' },
  { key: 'limpieza', label: '🧽 Limpieza' },
  { key: 'higiene', label: '🧴 Higiene' },
  { key: 'mascotas', label: '🐾 Mascotas' },
  { key: 'otros', label: '📦 Otros' },
];

const WORDS: Record<string, string[]> = {
  despensa: [
    'tomate frito', 'pan rallado', 'atun', 'arroz', 'pasta', 'macarron', 'espagueti', 'fideo', 'lenteja', 'garbanzo', 'alubia', 'judion',
    'harina', 'azucar', 'sal', 'aceite', 'vinagre', 'especia', 'pimienta', 'oregano', 'comino', 'pimenton', 'conserva', 'lata', 'legumbre',
    'avena', 'cereal', 'muesli', 'galleta', 'chocolate', 'cacao', 'cafe', 'te', 'infusion', 'manzanilla', 'miel', 'mermelada', 'nuez', 'nueces',
    'almendra', 'cacahuete', 'anacardo', 'pistacho', 'frutos secos', 'crema de cacahuete', 'quinoa', 'cuscus', 'caldo', 'salsa', 'mayonesa',
    'ketchup', 'mostaza', 'aceituna', 'tortita', 'pipas', 'patatas fritas', 'snack', 'levadura', 'bicarbonato', 'proteina', 'sardinillas',
    'berberecho', 'pimiento del piquillo', 'tomate triturado', 'tomate natural', 'garbanzos cocidos', 'cola cao', 'colacao', 'nocilla',
  ],
  fruta: [
    'manzana', 'platano', 'naranja', 'mandarina', 'pera', 'uva', 'fresa', 'kiwi', 'melon', 'sandia', 'pina', 'mango', 'aguacate', 'limon',
    'lima', 'tomate', 'lechuga', 'cebolla', 'cebolleta', 'ajo', 'patata', 'zanahoria', 'pimiento', 'calabacin', 'berenjena', 'pepino',
    'brocoli', 'coliflor', 'espinaca', 'acelga', 'champinon', 'seta', 'judia verde', 'judias verdes', 'calabaza', 'puerro', 'apio',
    'rucula', 'canonigo', 'perejil', 'cilantro', 'albahaca', 'jengibre', 'fruta', 'verdura', 'ensalada', 'boniato', 'alcachofa', 'esparrago',
    'arandano', 'frambuesa', 'cereza', 'melocoton', 'nectarina', 'ciruela', 'granada', 'higo', 'coco', 'col', 'repollo', 'remolacha',
    'nabo', 'rabano', 'maiz', 'guisante', 'hierbabuena', 'menta',
  ],
  carne: [
    'pollo', 'pechuga', 'muslo', 'pavo', 'ternera', 'cerdo', 'lomo', 'solomillo', 'carne', 'picada', 'hamburguesa', 'salchicha', 'chorizo',
    'jamon', 'bacon', 'beicon', 'costilla', 'cordero', 'conejo', 'pescado', 'merluza', 'salmon', 'bacalao', 'dorada', 'lubina', 'gamba',
    'langostino', 'mejillon', 'calamar', 'sepia', 'pulpo', 'sardina', 'boqueron', 'rape', 'emperador', 'fiambre', 'embutido', 'lacon',
    'morcilla', 'longaniza', 'fuet', 'salchichon', 'chuleta', 'filete', 'albondiga', 'trucha', 'caballa', 'almeja', 'surimi',
  ],
  lacteos: [
    'leche', 'yogur', 'queso', 'mantequilla', 'nata', 'huevo', 'kefir', 'requeson', 'skyr', 'batido', 'cuajada', 'margarina', 'natillas',
    'flan', 'bebida de avena', 'bebida de soja', 'bebida vegetal', 'mozzarella', 'burrata', 'tofu',
  ],
  pan: ['pan', 'barra', 'baguette', 'molde', 'tostada', 'picos', 'regaña', 'bolleria', 'croissant', 'magdalena', 'bizcocho', 'tortilla de trigo', 'wrap', 'colines'],
  congelados: ['congelad', 'helado', 'hielo', 'pizza', 'croqueta', 'nugget', 'empanadilla', 'san jacobo', 'varitas'],
  bebidas: ['agua', 'refresco', 'cola', 'zumo', 'cerveza', 'vino', 'gaseosa', 'tonica', 'isotonica', 'sidra', 'cava', 'licor', 'kombucha', 'bebida'],
  limpieza: [
    'detergente', 'suavizante', 'lejia', 'friegasuelos', 'lavavajillas', 'jabon de platos', 'fairy', 'estropajo', 'bayeta', 'bolsas de basura',
    'bolsa de basura', 'papel de cocina', 'servilleta', 'aluminio', 'papel film', 'film', 'limpiador', 'amoniaco', 'fregona', 'quitagrasas',
    'pastillas lavavajillas', 'ambientador', 'insecticida', 'guantes', 'cristasol', 'limpiacristales',
  ],
  higiene: [
    'champu', 'gel', 'desodorante', 'pasta de dientes', 'dentifrico', 'cepillo', 'papel higienico', 'compresa', 'tampon', 'cuchilla',
    'crema', 'colonia', 'perfume', 'algodon', 'pañuelo', 'panuelo', 'toallita', 'mascarilla', 'acondicionador', 'enjuague', 'hilo dental',
    'protector solar', 'maquillaje', 'bastoncillo', 'jabon de manos', 'jabon',
  ],
  mascotas: ['pienso', 'arena para gato', 'arena gato', 'comida para perro', 'comida perro', 'comida gato', 'comida para gato', 'premios perro'],
};

const INDEX = Object.entries(WORDS)
  .flatMap(([section, words]) => words.map((w) => ({ w: fold(w), section })))
  .sort((a, b) => b.w.length - a.w.length);

/** Sección del súper para un producto («2 kg naranjas» → fruta y verdura). */
export function shopSection(text: string): string {
  const f = ` ${fold(text).replace(/[^a-z0-9ñ ]/g, ' ')} `;
  for (const { w, section } of INDEX) {
    // Palabra completa o inicio de palabra (plurales: «manzanas»)
    if (f.includes(` ${w} `) || f.includes(` ${w}s `) || f.includes(` ${w}es `) || (w.length >= 5 && f.includes(` ${w}`))) return section;
  }
  return 'otros';
}
