import { describe, expect, it } from 'vitest';
import { parseListInput, shopSection } from './listInput';

describe('parseListInput', () => {
  it('varias cosas con cantidades', () => {
    expect(parseListInput('2 kg naranjas, leche x6, pan\n1 docena de huevos; 3 latas de atún')).toEqual([
      { qty: '2 kg', text: 'Naranjas' },
      { qty: '6', text: 'Leche' },
      { text: 'Pan' },
      { qty: '1 docena', text: 'Huevos' },
      { qty: '3 latas', text: 'Atún' },
    ]);
  });
});

describe('shopSection', () => {
  it('coloca cada cosa en su sección del súper', () => {
    expect(shopSection('Naranjas')).toBe('fruta');
    expect(shopSection('Tomate frito')).toBe('despensa');
    expect(shopSection('Tomates')).toBe('fruta');
    expect(shopSection('Pechugas de pollo')).toBe('carne');
    expect(shopSection('Huevos')).toBe('lacteos');
    expect(shopSection('Pan de molde')).toBe('pan');
    expect(shopSection('Pan rallado')).toBe('despensa');
    expect(shopSection('Papel higiénico')).toBe('higiene');
    expect(shopSection('Bolsas de basura')).toBe('limpieza');
    expect(shopSection('Atún')).toBe('despensa');
    expect(shopSection('Bebida de avena')).toBe('lacteos');
    expect(shopSection('Pilas')).toBe('otros');
  });
});
