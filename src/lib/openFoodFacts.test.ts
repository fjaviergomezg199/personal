import { describe, expect, it, vi } from 'vitest';
import { searchOpenFoodFacts } from './openFoodFacts';

describe('Open Food Facts', () => {
  it('lee productos y descarta los que no tienen calorías', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('search_terms=yogur+proteico');
      expect(url).toContain('cc=es');
      return Response.json({
        products: [
          { code: '8480000', product_name: 'Yogur proteico natural', brands: 'Hacendado,Mercadona', nutriments: { 'energy-kcal_100g': 62, proteins_100g: 10, carbohydrates_100g: 4.1, fat_100g: 0.4 }, serving_quantity: 120 },
          { code: '2', product_name_es: 'Skyr', nutriments: { energy_100g: 263.6, proteins_100g: '11,0', carbohydrates_100g: 4, fat_100g: 0.2 } },
          { code: '3', product_name: 'Sin datos', nutriments: {} },
        ],
      });
    });
    const r = await searchOpenFoodFacts('yogur proteico', fetchImpl);
    expect(r).toEqual([
      { code: '8480000', name: 'Yogur proteico natural', brand: 'Hacendado', kcal: 62, protein: 10, carbs: 4.1, fat: 0.4, servingGrams: 120 },
      { code: '2', name: 'Skyr', brand: undefined, kcal: 63, protein: 11, carbs: 4, fat: 0.2, servingGrams: undefined },
    ]);
  });

  it('un código de barras busca ese producto', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/api/v2/product/8410000000000.json');
      return Response.json({ status: 1, product: { product_name: 'Galletas', nutriments: { 'energy-kcal_100g': 450, proteins_100g: 7, carbohydrates_100g: 70, fat_100g: 15 } } });
    });
    const r = await searchOpenFoodFacts('8410000000000', fetchImpl);
    expect(r[0]).toMatchObject({ code: '8410000000000', name: 'Galletas', kcal: 450 });
  });
});
