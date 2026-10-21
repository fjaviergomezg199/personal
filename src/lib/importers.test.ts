import { describe, expect, it } from 'vitest';
import { parseMenu, parsePlan } from './importers';

const opts = { start: '2026-10-26', today: '2026-10-21' };

describe('parsePlan', () => {
  it('formato JSON de Claude (con ```json)', () => {
    const text = '```json\n[{"fecha":"2026-10-26","titulo":"Rodaje 6 km","detalle":"Ritmo suave"},{"fecha":"2026-10-28","titulo":"Series","detalle":"6x400\\nRecuperación 1:30"}]\n```';
    const { items } = parsePlan(text, opts);
    expect(items).toEqual([
      { date: '2026-10-26', title: 'Rodaje 6 km', details: 'Ritmo suave', time: undefined },
      { date: '2026-10-28', title: 'Series', details: '6x400\nRecuperación 1:30', time: undefined },
    ]);
  });

  it('JSON con días relativos y semanas', () => {
    const { items } = parsePlan('{"sesiones":[{"semana":1,"dia":"lunes","sesion":"Rodaje"},{"semana":2,"dia":"jueves","sesion":"Tirada larga"},{"dia":3,"titulo":"Repaso"}]}', opts);
    expect(items.map((i) => [i.date, i.title])).toEqual([
      ['2026-10-26', 'Rodaje'],
      ['2026-10-28', 'Repaso'],
      ['2026-11-05', 'Tirada larga'],
    ]);
  });

  it('líneas "fecha | título | detalle"', () => {
    const text = `2026-10-26 | Tema 3: Románico | Leer apuntes p. 40-62
27/10 | Repaso Tema 1-2
28/10/2026 - Esquemas`;
    const { items } = parsePlan(text, opts);
    expect(items).toEqual([
      { date: '2026-10-26', title: 'Tema 3: Románico', details: 'Leer apuntes p. 40-62', time: undefined },
      { date: '2026-10-27', title: 'Repaso Tema 1-2', details: undefined, time: undefined },
      { date: '2026-10-28', title: 'Esquemas', details: undefined, time: undefined },
    ]);
  });

  it('Markdown típico con semanas y días', () => {
    const text = `## Semana 1
- **Lunes**: Rodaje suave 5 km
- **Miércoles**: Series 6x400m
  - Calentar 10 min
## Semana 2
- **Sábado**: Tirada larga 8 km`;
    const { items } = parsePlan(text, opts);
    expect(items.map((i) => [i.date, i.title, i.details])).toEqual([
      ['2026-10-26', 'Rodaje suave 5 km', undefined],
      ['2026-10-28', 'Series 6x400m', 'Calentar 10 min'],
      ['2026-11-07', 'Tirada larga 8 km', undefined],
    ]);
  });

  it('tabla Markdown', () => {
    const text = `| Fecha | Sesión | Detalle |
|---|---|---|
| 26/10 | Rodaje | 5 km suave |
| 29/10 | Fartlek | 8x1' rápido |`;
    const { items } = parsePlan(text, opts);
    expect(items.map((i) => [i.date, i.title, i.details])).toEqual([
      ['2026-10-26', 'Rodaje', '5 km suave'],
      ['2026-10-29', 'Fartlek', "8x1' rápido"],
    ]);
  });

  it('entrenamiento pegado con cabeceras de día', () => {
    const text = `Lunes 26/10
A) Back squat 5x3 @80%
B) AMRAP 12'

Martes 27/10
Deadlift 5x2 @85%`;
    const { items } = parsePlan(text, { ...opts, defaultTitle: 'Entrenamiento' });
    expect(items).toEqual([
      { date: '2026-10-26', title: 'A) Back squat 5x3 @80%', details: "B) AMRAP 12'", time: undefined },
      { date: '2026-10-27', title: 'Deadlift 5x2 @85%', details: undefined, time: undefined },
    ]);
  });

  it('cambio de año', () => {
    const { items } = parsePlan('30/12 | Repaso\n2/1 | Examen', { start: '2026-12-28', today: '2026-12-20' });
    expect(items.map((i) => i.date)).toEqual(['2026-12-30', '2027-01-02']);
  });

  it('hora tras la fecha', () => {
    const { items } = parsePlan('Lunes 26/10 19:00 | Rodaje', opts);
    expect(items[0]).toMatchObject({ date: '2026-10-26', time: '19:00', title: 'Rodaje' });
  });
});

describe('parseMenu', () => {
  it('JSON por días', () => {
    const menu = parseMenu('{"lunes":{"Desayuno":"Tostada","Cena":"Crema de calabaza"},"martes":{"Comida":"Lentejas"}}');
    expect(menu).toEqual({
      meals: ['Desayuno', 'Comida', 'Cena'],
      days: { 0: { Desayuno: 'Tostada', Cena: 'Crema de calabaza' }, 1: { Comida: 'Lentejas' } },
    });
  });

  it('bloques de texto', () => {
    const menu = parseMenu(`**Lunes**
- Desayuno: Café con leche y tostada
- Comida: Pollo con arroz
  ensalada verde
**Martes**
- Desayuno: Yogur con avena`);
    expect(menu?.days[0]).toEqual({ Desayuno: 'Café con leche y tostada', Comida: 'Pollo con arroz\nensalada verde' });
    expect(menu?.days[1]).toEqual({ Desayuno: 'Yogur con avena' });
  });

  it('tabla con días en filas', () => {
    const menu = parseMenu(`| Día | Desayuno | Comida | Cena |
|---|---|---|---|
| Lunes | Tostada | Lentejas | Tortilla |
| Martes | Yogur | Pasta | Pescado |`);
    expect(menu?.meals).toEqual(['Desayuno', 'Comida', 'Cena']);
    expect(menu?.days[1]).toEqual({ Desayuno: 'Yogur', Comida: 'Pasta', Cena: 'Pescado' });
  });

  it('tabla con días en columnas', () => {
    const menu = parseMenu(`| | Lunes | Martes |
|---|---|---|
| Desayuno | Tostada | Yogur |
| Cena | Tortilla | Pescado |`);
    expect(menu?.days[0]).toEqual({ Desayuno: 'Tostada', Cena: 'Tortilla' });
    expect(menu?.days[1]).toEqual({ Desayuno: 'Yogur', Cena: 'Pescado' });
  });

  it('líneas día | comida | texto', () => {
    const menu = parseMenu('Lunes | Desayuno | Tostada\nLunes | Cena | Sopa');
    expect(menu?.days[0]).toEqual({ Desayuno: 'Tostada', Cena: 'Sopa' });
  });
});
