import { describe, expect, it } from 'vitest';
import { importPrompt, parsePlan } from './calendarImport';

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

  it('tabla de texto con la hora en su columna (el ejemplo del README)', () => {
    const { items } = parsePlan('Lunes 2/11 | 19:00 | Rodaje\nMiércoles 4/11 | 19:00 | Series 6x400', { start: '2026-11-02', today: '2026-10-28' });
    expect(items.map((i) => [i.date, i.time, i.title])).toEqual([
      ['2026-11-02', '19:00', 'Rodaje'],
      ['2026-11-04', '19:00', 'Series 6x400'],
    ]);
  });
});

describe('importar al calendario: lo que trae cada elemento', () => {
  const opts = { start: '2026-11-02', today: '2026-10-28' };

  it('hora de fin o duración, categoría, tipo y lugar', () => {
    const json = JSON.stringify([
      { fecha: '2026-11-02', hora: '19:00', duracion: 45, titulo: 'Rodaje suave 6 km', categoria: 'Running', tipo: 'tarea' },
      { date: '2026-11-04T18:30', end: '20:00', title: 'Clase', category: '2Sigma', type: 'event', location: 'Academia' },
      { fecha: '2026-11-05', hora: '23:30', duracion: 90, titulo: 'Tarde' },
    ]);
    const { items } = parsePlan(json, opts);
    expect(items).toEqual([
      { date: '2026-11-02', title: 'Rodaje suave 6 km', time: '19:00', endTime: '19:45', category: 'Running', kind: 'task' },
      { date: '2026-11-04', title: 'Clase', time: '18:30', endTime: '20:00', category: '2Sigma', kind: 'event', location: 'Academia' },
      // Pasaría de medianoche: hasta el final del día
      { date: '2026-11-05', title: 'Tarde', time: '23:30', endTime: '23:59' },
    ]);
  });

  it('semanas con sus días dentro', () => {
    const json = JSON.stringify({
      plan: [
        { semana: 1, categoria: 'Running', sesiones: [{ dia: 'lunes', titulo: 'Rodaje 5 km' }, { dia: 'jueves', titulo: 'Series 6x400' }] },
        { semana: 2, sesiones: [{ dia: 'domingo', titulo: 'Tirada larga 12 km', hora: '9:00' }] },
      ],
    });
    const { items } = parsePlan(json, opts);
    expect(items.map((i) => [i.date, i.title, i.category ?? '', i.time ?? ''])).toEqual([
      ['2026-11-02', 'Rodaje 5 km', 'Running', ''],
      ['2026-11-05', 'Series 6x400', 'Running', ''],
      ['2026-11-15', 'Tirada larga 12 km', '', '09:00'],
    ]);
  });

  it('las instrucciones para la IA llevan la fecha de inicio y el formato', () => {
    const p = importPrompt('2026-11-02', 'Running');
    expect(p).toContain('2026-11-02');
    expect(p).toContain('"categoria": "Running"');
    expect(p).toContain('\\n');
    // El ejemplo es un JSON válido que la app sabe importar
    const example = p.slice(p.indexOf('['));
    expect(parsePlan(example, opts).items[0]).toMatchObject({ date: '2026-11-02', time: '19:00', endTime: '19:45', category: 'Running', kind: 'task' });
  });
});
