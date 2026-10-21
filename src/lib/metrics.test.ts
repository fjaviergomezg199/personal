import { describe, expect, it } from 'vitest';
import type { MetricEntry } from '../store/types';
import { changeOver, dateTickLabel, dateTicks, goalDirection, goalProgress, niceScale, rangeStart, seriesFor } from './metrics';

const e = (date: string, value: number, metricId = 'peso'): MetricEntry => ({ id: date + metricId, metricId, date, value });

describe('peso y medidas', () => {
  it('ejes con números redondos', () => {
    expect(niceScale(72.1, 73.4)).toMatchObject({ lo: 72, hi: 73.5, step: 0.5, ticks: [72, 72.5, 73, 73.5], decimals: 1 });
    expect(niceScale(60, 95)).toMatchObject({ lo: 60, hi: 100, step: 20, ticks: [60, 80, 100] });
    expect(niceScale(80, 80).ticks.length).toBeGreaterThanOrEqual(2);
    const s = niceScale(70.04, 70.31);
    expect(s.step).toBe(0.1);
    expect(s.ticks[0]).toBeLessThanOrEqual(70.04);
    expect(s.ticks[s.ticks.length - 1]).toBeGreaterThanOrEqual(70.31);
  });

  it('fechas del eje: días, lunes o meses', () => {
    expect(dateTicks('2026-10-19', '2026-10-21')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    const weeks = dateTicks('2026-10-01', '2026-10-21');
    expect(weeks).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    const months = dateTicks('2026-07-21', '2026-10-21');
    expect(months).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    const year = dateTicks('2025-10-21', '2026-10-21');
    expect(year.length).toBeLessThanOrEqual(4);
    expect(year.every((d) => d.endsWith('-01'))).toBe(true);
    expect(dateTickLabel('2026-10-05', weeks, '2026-10-01', '2026-10-21')).toBe('5 oct');
    expect(dateTickLabel('2026-09-01', months, '2026-07-21', '2026-10-21')).toBe('sep');
    expect(dateTickLabel('2026-01-01', year, '2025-10-21', '2026-10-21')).toBe('ene 26');
  });

  it('cambio en el periodo y ritmo semanal', () => {
    const pts = [e('2026-09-01', 75), e('2026-09-15', 74.2), e('2026-10-13', 73)];
    const c = changeOver(pts)!;
    expect(c.delta).toBeCloseTo(-2);
    expect(c.from).toBe('2026-09-01');
    expect(c.perWeek).toBeCloseTo((-2 / 42) * 7);
    expect(changeOver([e('2026-10-01', 70), e('2026-10-05', 70.4)])?.perWeek).toBeUndefined();
    expect(changeOver([e('2026-10-01', 70)])).toBeNull();
  });

  it('objetivo: dirección y progreso', () => {
    expect(goalDirection(70, 75)).toBe(-1);
    expect(goalDirection(80, 75)).toBe(1);
    expect(goalDirection(undefined, 75)).toBe(0);
    expect(goalProgress(75, 72.5, 70)).toBeCloseTo(0.5);
    expect(goalProgress(75, 76, 70)).toBe(0);
    expect(goalProgress(75, 69, 70)).toBe(1);
    expect(goalProgress(60, 63, 66)).toBeCloseTo(0.5);
  });

  it('periodo y serie ordenada', () => {
    expect(rangeStart('3M', '2026-10-21')).toBe('2026-07-21');
    expect(rangeStart('todo', '2026-10-21')).toBeUndefined();
    const all = [e('2026-10-10', 72), e('2026-06-01', 76), e('2026-08-01', 74), e('2026-08-01', 90, 'cintura')];
    expect(seriesFor(all, 'peso').map((x) => x.value)).toEqual([76, 74, 72]);
    expect(seriesFor(all, 'peso', '2026-07-21').map((x) => x.value)).toEqual([74, 72]);
  });
});
