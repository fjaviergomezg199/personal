import { describe, expect, it } from 'vitest';
import type { ListItem, Menu } from '../store/types';
import { menuIngredients, sameItem } from './menuShopping';

const menu: Menu = {
  meals: ['Desayuno', 'Comida', 'Cena'],
  days: {
    0: { Desayuno: '2 huevos revueltos con una tostada', Comida: '150 g de pechuga de pollo con 80 g de arroz', Cena: 'Ensalada de tomate y 200 g de merluza' },
    1: { Desayuno: 'Café con leche y 40 g de avena', Comida: '150 g de pechuga de pollo con verduras al wok', Cena: '1 huevo y quinoa' },
    2: { Comida: 'Lentejas con chorizo', Cena: 'Poke de salmón con edamame' },
  },
};

describe('del menú a la compra', () => {
  it('suma lo que se repite y lo ordena como el súper', () => {
    const r = menuIngredients(menu, [0, 1], [], []);
    const pollo = r.find((i) => i.text === 'Pechuga de pollo')!;
    expect(pollo).toMatchObject({ qty: '300 g', section: 'carne', inList: false });
    expect(r.find((i) => i.text === 'Huevo')!.qty).toBe('3 uds');
    expect(r.find((i) => i.text === 'Arroz')!.qty).toBe('80 g');
    // El café con leche se compra como leche
    expect(r.find((i) => i.text === 'Leche')!.qty).toBe('160 ml');
    // Fruta y verdura primero
    expect(r[0].section).toBe('fruta');
    // El miércoles no se ha elegido
    expect(r.some((i) => /lentejas/i.test(i.text))).toBe(false);
  });

  it('marca lo que ya está en la lista y deja aparte lo que no reconoce', () => {
    const list = [
      { id: 'L1', list: 'compra', text: 'merluza', done: false, updatedAt: 1 },
      { id: 'L2', list: 'compra', text: 'Huevos', done: false, updatedAt: 1 },
    ] as ListItem[];
    const r = menuIngredients(menu, [0, 1, 2], [], list);
    expect(r.find((i) => i.text === 'Merluza')!.inList).toBe(true);
    expect(r.find((i) => i.text === 'Huevo')!.inList).toBe(true); // «Huevos» en la lista
    expect(r.filter((i) => i.unknown).map((i) => i.text)).toEqual(['Edamame']);
  });
});

describe('misma cosa en la lista', () => {
  it('sin plurales, tildes ni mayúsculas', () => {
    expect(sameItem('Tomates', 'tomate')).toBe(true);
    expect(sameItem('Limones', 'limón')).toBe(true);
    expect(sameItem('nueces', 'Nuez')).toBe(true);
    expect(sameItem('Pechugas de pollo', 'pechuga de pollo')).toBe(true);
    expect(sameItem('Pan', 'Panes')).toBe(true);
    expect(sameItem('Tomate', 'Tomate frito')).toBe(false);
    expect(sameItem('Pera', 'Perejil')).toBe(false);
  });
});
