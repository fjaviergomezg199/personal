import { describe, expect, it } from 'vitest';
import type { Lift } from '../store/types';
import { aliasesFor, annotateWorkout, formatKg, percentTable, platesPerSide } from './lifts';

const lift = (id: string, name: string, rm: number): Lift => ({
  id, name, rm, aliases: aliasesFor(name), updatedAt: '', history: [],
});
const LIFTS = [lift('dl', 'Peso muerto', 140), lift('bs', 'Sentadilla trasera', 110), lift('pc', 'Power clean', 80), lift('cl', 'Clean', 90)];

describe('annotateWorkout', () => {
  it('calcula el % en la misma línea (inglés)', () => {
    const [line] = annotateWorkout('Deadlift 5x3 @80%', LIFTS);
    expect(line.loads).toEqual([{ liftId: 'dl', liftName: 'Peso muerto', pct: 80, pct2: undefined, kg: 112.5, kg2: undefined }]);
  });

  it('usa el levantamiento de la línea anterior y rangos', () => {
    const lines = annotateWorkout('A) Back Squat\n5x5 @ 70-75%\n\nB) 3x3 @80%', LIFTS);
    expect(lines[1].loads[0]).toMatchObject({ liftId: 'bs', pct: 70, pct2: 75, kg: 77.5, kg2: 82.5 });
    expect(lines[3].loads).toEqual([]); // bloque nuevo sin levantamiento
  });

  it('prefiere el nombre más largo (power clean frente a clean)', () => {
    const [line] = annotateWorkout('Power Clean EMOM 10: 2 reps @75%', LIFTS);
    expect(line.loads[0]).toMatchObject({ liftId: 'pc', kg: 60 });
  });

  it('ignora números que no son cargas', () => {
    const [line] = annotateWorkout('Peso muerto 5x3 al 10% de esfuerzo', LIFTS);
    expect(line.loads).toEqual([]);
  });

  it('español y abreviaturas', () => {
    expect(annotateWorkout('Sentadilla 3x5 al 85%', LIFTS)[0].loads[0]).toMatchObject({ liftId: 'bs', kg: 92.5 });
    expect(annotateWorkout('DL 3x3 @ 90%', LIFTS)[0].loads[0]).toMatchObject({ liftId: 'dl', kg: 125 });
  });
});

describe('utilidades', () => {
  it('formatKg', () => {
    expect(formatKg(112.5)).toBe('112,5');
    expect(formatKg(60)).toBe('60');
  });
  it('tabla de porcentajes', () => {
    expect(percentTable(100, 2.5, 90, 100, 5)).toEqual([{ pct: 100, kg: 100 }, { pct: 95, kg: 95 }, { pct: 90, kg: 90 }]);
  });
  it('discos por lado', () => {
    expect(platesPerSide(112.5)).toEqual([25, 20, 1.25]);
    expect(platesPerSide(15)).toBeNull();
  });
});
