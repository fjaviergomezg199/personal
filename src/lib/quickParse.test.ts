import { describe, expect, it } from 'vitest';
import { cleanTitle, parseQuick, splitHashtag } from './quickParse';

// Miércoles 21 de octubre de 2026, 10:00
const NOW = new Date(2026, 9, 21, 10, 0);
const p = (s: string) => parseQuick(s, NOW);

describe('parseQuick', () => {
  it('fecha relativa y hora', () => {
    expect(p('mañana a las 10 dentista')).toMatchObject({
      kind: 'event', title: 'Dentista', date: '2026-10-22', time: '10:00', category: 'health',
    });
  });

  it('día de la semana y hora con minutos', () => {
    expect(p('viernes 18:30 cena con Ana')).toMatchObject({
      kind: 'event', title: 'Cena con Ana', date: '2026-10-23', time: '18:30', category: 'food',
    });
  });

  it('salida de entradas', () => {
    expect(p('entradas Rosalía 25/10 10:00')).toMatchObject({
      kind: 'reminder', title: 'Entradas Rosalía', date: '2026-10-25', time: '10:00', category: 'tickets', alert: 10,
    });
  });

  it('cumpleaños con dd/mm', () => {
    const r = p('cumple de Marta 12/03');
    expect(r.kind).toBe('birthday');
    expect(r.birthday).toEqual({ name: 'Marta', day: 12, month: 3, year: undefined });
  });

  it('cumpleaños con mes en letra y año', () => {
    const r = p('Cumpleaños de mamá el 3 de mayo de 1965');
    expect(r.kind).toBe('birthday');
    expect(r.birthday).toEqual({ name: 'Mamá', day: 3, month: 5, year: 1965 });
  });

  it('fiesta de cumpleaños con hora es un plan', () => {
    expect(p('fiesta de cumple de Ana el sábado a las 18:00')).toMatchObject({
      kind: 'event', date: '2026-10-24', time: '18:00', category: 'party',
    });
  });

  it('tarea sin fecha', () => {
    expect(p('comprar pan')).toMatchObject({ kind: 'task', title: 'Comprar pan', date: undefined });
  });

  it('pasado mañana', () => {
    expect(p('llamar al banco pasado mañana')).toMatchObject({ kind: 'reminder', title: 'Llamar al banco', date: '2026-10-23' });
  });

  it('dentro de X horas', () => {
    expect(p('en 2 horas llamar a mamá')).toMatchObject({ title: 'Llamar a mamá', date: '2026-10-21', time: '12:00' });
  });

  it('repetición semanal', () => {
    expect(p('todos los lunes a las 9 reunión academia')).toMatchObject({
      kind: 'event', title: 'Reunión academia', date: '2026-10-26', time: '09:00', repeat: 'weekly',
    });
  });

  it('"a las 5" es por la tarde y hoy si no ha pasado', () => {
    expect(p('a las 5 tutoría')).toMatchObject({ date: '2026-10-21', time: '17:00', title: 'Tutoría' });
  });

  it('hora ya pasada → mañana', () => {
    expect(p('a las 8 correr')).toMatchObject({ date: '2026-10-22', time: '08:00', title: 'Correr' });
  });

  it('esta tarde', () => {
    expect(p('esta tarde llamar a Leyre')).toMatchObject({ date: '2026-10-21', time: '17:00', title: 'Llamar a Leyre', kind: 'reminder' });
  });

  it('mañana por la mañana', () => {
    expect(p('mañana por la mañana gimnasio')).toMatchObject({ date: '2026-10-22', time: '09:00', title: 'Gimnasio' });
  });

  it('fecha pasada sin año → el año que viene', () => {
    expect(p('el 3 de marzo revisión coche')).toMatchObject({ date: '2027-03-03', title: 'Revisión coche' });
  });

  it('fecha y hora completas', () => {
    expect(p('examen de arte gótico el 15 de diciembre a las 9:30')).toMatchObject({
      kind: 'event', title: 'Examen de arte gótico', date: '2026-12-15', time: '09:30', category: 'study',
    });
  });

  it('cada mes', () => {
    expect(p('pagar el alquiler el día 1 de cada mes')).toMatchObject({
      title: 'Pagar el alquiler', date: '2026-11-01', repeat: 'monthly', kind: 'reminder',
    });
  });

  it('rango horario', () => {
    expect(p('reunión de 10 a 12 el jueves')).toMatchObject({ date: '2026-10-22', time: '10:00', endTime: '12:00', title: 'Reunión' });
  });

  it('mes abreviado y "21h"', () => {
    expect(p('concierto Vetusta Morla 14 nov 21h')).toMatchObject({
      kind: 'event', title: 'Concierto Vetusta Morla', date: '2026-11-14', time: '21:00', category: 'concert',
    });
  });

  it('de la noche', () => {
    expect(p('a las 10 de la noche sacar basura')).toMatchObject({ time: '22:00', title: 'Sacar basura' });
  });

  it('dentro de días', () => {
    expect(p('dentro de 3 días renovar DNI')).toMatchObject({ date: '2026-10-24', title: 'Renovar DNI' });
  });

  it('mismo día de la semana → la semana que viene', () => {
    expect(p('miércoles yoga').date).toBe('2026-10-28');
    expect(p('el lunes').date).toBe('2026-10-26');
  });

  it('el día del mes', () => {
    expect(p('el 25 llamar al fontanero').date).toBe('2026-10-25');
    expect(p('el 5 pagar').date).toBe('2026-11-05');
  });

  it('no confunde series con fechas', () => {
    expect(p('Series 6x400 el jueves')).toMatchObject({ title: 'Series 6x400', date: '2026-10-22', time: undefined });
  });

  it('recuérdame', () => {
    expect(p('recuérdame mañana llamar al seguro')).toMatchObject({ kind: 'reminder', title: 'Llamar al seguro', date: '2026-10-22' });
  });

  it('a la una y media', () => {
    expect(p('comer con Pablo a la una y media')).toMatchObject({ time: '13:30', title: 'Comer con Pablo', kind: 'event' });
  });
});

describe('cleanTitle', () => {
  it('quita conectores sueltos en los extremos', () => {
    expect(cleanTitle('  el  dentista   a ')).toBe('Dentista');
    expect(cleanTitle('aún queda')).toBe('Aún queda');
    expect(cleanTitle(', cena con Ana -')).toBe('Cena con Ana');
  });
});

describe('«#categoría» al escribir', () => {
  it('saca la etiqueta (en cualquier sitio) y deja el resto', () => {
    expect(splitHashtag('#2sigma reunión mañana a las 10')).toEqual({ tag: '2sigma', rest: 'reunión mañana a las 10' });
    expect(splitHashtag('rodaje 6 km #running jueves 19:00')).toEqual({ tag: 'running', rest: 'rodaje 6 km jueves 19:00' });
    expect(splitHashtag('clase #Inglés')).toEqual({ tag: 'Inglés', rest: 'clase' });
    expect(splitHashtag('#señora_limpieza el lunes')).toEqual({ tag: 'señora_limpieza', rest: 'el lunes' });
  });

  it('sin etiqueta, o «#» suelto o pegado a una palabra, no hace nada', () => {
    expect(splitHashtag('dentista mañana')).toEqual({ rest: 'dentista mañana' });
    expect(splitHashtag('llamar al # de la tienda')).toEqual({ rest: 'llamar al # de la tienda' });
    expect(splitHashtag('pedido C#5 el viernes')).toEqual({ rest: 'pedido C#5 el viernes' });
  });

  it('con dos, la primera es la categoría', () => {
    expect(splitHashtag('#trabajo #casa revisar')).toEqual({ tag: 'trabajo', rest: '#casa revisar' });
  });
});
