import { describe, expect, it } from 'vitest';
import type { FoodLogItem } from '../store/types';
import { mealForNow, mealsForDay, menuHasAlternatives, menuOptions, recentFoods, stripQuantity } from './diary';

const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m);

describe('diario de comidas', () => {
  it('propone la comida según la hora', () => {
    const meals = ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena'];
    expect(mealForNow(meals, at(7, 30))).toBe('Desayuno');
    expect(mealForNow(meals, at(11, 40))).toBe('Media mañana');
    expect(mealForNow(meals, at(14))).toBe('Comida');
    expect(mealForNow(meals, at(18))).toBe('Merienda');
    expect(mealForNow(meals, at(22))).toBe('Cena');
    // Sin media mañana: a las 11:40 lo más cercano es la comida o el desayuno, nunca una que no existe
    expect(['Desayuno', 'Comida']).toContain(mealForNow(['Desayuno', 'Comida', 'Cena'], at(11, 40)));
    expect(mealForNow(['Pre-entreno', 'Post-entreno'], at(12))).toBe('Pre-entreno');
  });

  it('lista las comidas del menú y añade las que solo están apuntadas', () => {
    const log = [{ meal: 'Pre-entreno' }, { meal: 'Comida' }, { meal: 'Pre-entreno' }] as FoodLogItem[];
    expect(mealsForDay(['Desayuno', 'Comida', 'Cena'], log)).toEqual(['Desayuno', 'Comida', 'Cena', 'Pre-entreno']);
    expect(mealsForDay(undefined, [])).toEqual(['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena']);
  });

  it('separa las opciones del menú', () => {
    expect(menuOptions('Opción 1: tostada con tomate\nOpción 2: yogur con avena')).toEqual(['tostada con tomate', 'yogur con avena']);
    expect(menuOptions('- Ensalada\n• Pollo a la plancha\n')).toEqual(['Ensalada', 'Pollo a la plancha']);
    expect(menuOptions('Lentejas con verduras')).toEqual(['Lentejas con verduras']);
    expect(menuHasAlternatives('Opción 1: tostada con tomate\nOpción 2: yogur con avena')).toBe(true);
    expect(menuHasAlternatives('Lentejas con verduras\nFruta')).toBe(false);
  });

  it('quita la cantidad para nombrar un alimento nuevo', () => {
    expect(stripQuantity('2 yogures proteicos')).toBe('Yogures proteicos');
    expect(stripQuantity('150 g de skyr')).toBe('Skyr');
    expect(stripQuantity('un bollo')).toBe('Bollo');
    expect(stripQuantity('kéfir')).toBe('Kéfir');
    expect(stripQuantity('un vaso de kombucha')).toBe('Kombucha');
    expect(stripQuantity('2 limones')).toBe('Limones');
    expect(stripQuantity('uno de esos bollos')).toBe('Esos bollos');
  });

  it('recientes: sin repetir y con la última cantidad', () => {
    const log: FoodLogItem[] = [
      { id: '1', date: '2026-10-20', meal: 'Comida', name: 'Pechuga de pollo', grams: 150, foodId: 'pollo', createdAt: '2026-10-20T12:00:00Z', kcal: 165, protein: 34.5, carbs: 0, fat: 2.3 },
      { id: '2', date: '2026-10-21', meal: 'Comida', name: 'Pechuga de pollo', grams: 200, foodId: 'pollo', createdAt: '2026-10-21T12:00:00Z', kcal: 220, protein: 46, carbs: 0, fat: 3 },
      { id: '3', date: '2026-10-21', meal: 'Cena', name: 'Algo raro', grams: 50, foodId: 'cdesaparecido', createdAt: '2026-10-21T20:00:00Z', kcal: 100, protein: 5, carbs: 10, fat: 4 },
    ];
    const r = recentFoods(log, []);
    expect(r.map((x) => [x.food.name, x.grams])).toEqual([
      ['Algo raro', 50],
      ['Pechuga de pollo', 200],
    ]);
    // El que ya no existe se reconstruye por 100 g
    expect(r[0].food).toMatchObject({ kcal: 200, protein: 10, carbs: 20, fat: 8 });
  });
});
