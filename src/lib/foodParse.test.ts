import { describe, expect, it } from 'vitest';
import { macrosFor, searchFoods, sumMacros } from './foods';
import { parseFoodText } from './foodParse';

const p = (t: string) => parseFoodText(t).map((x) => [x.food?.key ?? `?${x.source}`, x.grams, x.estimated]);

describe('parseFoodText', () => {
  it('gramos con «de»', () => {
    expect(p('150 g de pechuga de pollo con 80 g de arroz')).toEqual([
      ['pollo', 150, false],
      ['arroz', 80, false],
    ]);
  });
  it('unidades y piezas', () => {
    expect(p('2 huevos')).toEqual([['huevo', 110, false]]);
    expect(p('1 tostada integral con aguacate y 1 huevo')).toEqual([
      ['pan-integral', 30, false],
      ['aguacate', 70, true],
      ['huevo', 55, false],
    ]);
    expect(p('medio aguacate')).toEqual([['aguacate', 70, false]]);
  });
  it('medidas caseras', () => {
    expect(p('1 cucharada de aceite de oliva')).toEqual([['aceite-oliva', 10, false]]);
    expect(p('un puñado de almendras')).toEqual([['almendras', 30, false]]);
    expect(p('1 lata de atún al natural')).toEqual([['atun-natural', 56, false]]);
    expect(p('2 rebanadas de pan de molde integral')).toEqual([['pan-molde-integral', 54, false]]);
    expect(p('1 scoop de proteína')).toEqual([['proteina', 30, false]]);
    expect(p('1 vaso de leche semidesnatada')).toEqual([['leche-semi', 250, false]]);
  });
  it('platos con varias cosas', () => {
    expect(p('Café con leche semidesnatada')).toEqual([['cafe-con-leche', 200, true]]);
    expect(p('1 yogur natural y 20 g de nueces')).toEqual([
      ['yogur', 125, false],
      ['nueces', 20, false],
    ]);
    expect(p('Ensalada de tomate y lechuga con 1 cucharada de aceite de oliva')).toEqual([
      ['tomate', 120, true],
      ['lechuga', 80, true],
      ['aceite-oliva', 10, false],
    ]);
  });
  it('rangos, plurales y cantidad detrás', () => {
    expect(p('60-80 g de lentejas')).toEqual([['lentejas', 70, false]]);
    expect(p('Pechugas de pollo (150 g)')).toEqual([['pollo', 150, false]]);
    expect(p('tomates cherry, 2 kiwis')).toEqual([
      ['tomate', 120, true],
      ['kiwi', 150, false],
    ]);
    expect(p('arroz 80g')).toEqual([['arroz', 80, false]]);
  });
  it('lo que no conoce lo deja marcado', () => {
    expect(p('quinoa con kombucha')).toEqual([
      ['quinoa', 70, true],
      ['?kombucha', 0, true],
    ]);
    expect(p('pollo a la plancha con sal y pimienta')).toEqual([['pollo', 150, true]]);
  });
});

describe('macros', () => {
  it('calcula por gramos y suma', () => {
    const items = parseFoodText('150 g de pechuga de pollo con 80 g de arroz y 1 cucharada de aceite de oliva');
    const total = sumMacros(items.map((i) => macrosFor(i.food!, i.grams)));
    expect(total).toEqual({ kcal: 165 + 288 + 90, protein: 34.5 + 5.6, carbs: 63.2, fat: 2.3 + 0.5 + 10 });
  });
  it('buscador', () => {
    expect(searchFoods('pollo', [])[0].key).toBe('pollo');
    expect(searchFoods('yogur gri', []).map((f) => f.key)).toContain('yogur-griego');
    expect(searchFoods('zz', [])).toEqual([]);
  });
});
