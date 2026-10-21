import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { daysBetween, formatShort } from '../lib/dates';
import { dateTickLabel, dateTicks, niceScale } from '../lib/metrics';
import { fmtFixed } from '../lib/num';

export interface ChartPoint {
  date: string;
  value: number;
}

const PLOT_H = 176;
const AXIS_H = 26;
const TOP = 16;
const LEFT = 40;
const RIGHT = 14;

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * Una serie en el tiempo: línea de 2 px con un velo suave, punto final con su
 * valor, línea de objetivo, y cruz + ficha al pasar el dedo (o con las flechas).
 */
export function LineChart({ points, goal, unit, decimals, name }: { points: ChartPoint[]; goal?: number; unit: string; decimals: number; name: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const [active, setActive] = useState<number | null>(null);

  const first = points[0];
  const last = points[points.length - 1];
  const fmt = (v: number) => fmtFixed(v, decimals);
  const label = `Gráfica de ${name}: de ${fmt(first.value)} ${unit} el ${formatShort(first.date)} a ${fmt(last.value)} ${unit} el ${formatShort(last.date)}.`;

  const values = points.map((p) => p.value);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  // El objetivo entra en la gráfica si está cerca; si está lejos aplastaría la línea, y se indica con una flecha.
  const near = Math.max(vMax - vMin, Math.abs(vMax) * 0.01, 10 ** -decimals) * 1.2;
  const goalIn = goal !== undefined && goal >= vMin - near && goal <= vMax + near;
  let min = goalIn ? Math.min(vMin, goal!) : vMin;
  let max = goalIn ? Math.max(vMax, goal!) : vMax;
  const pad = (max - min) * 0.06;
  min -= pad;
  max += pad;
  const scale = niceScale(min, max, 4);
  const span = Math.max(1, daysBetween(first.date, last.date));
  const plotW = Math.max(10, width - LEFT - RIGHT);
  const x = (date: string) => LEFT + (daysBetween(first.date, date) / span) * plotW;
  const y = (v: number) => TOP + (1 - (v - scale.lo) / (scale.hi - scale.lo || 1)) * PLOT_H;
  const xs = points.map((p) => x(p.date));
  const ys = points.map((p) => y(p.value));

  const line = points.map((_, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const area = `${line} L${xs[xs.length - 1].toFixed(1)} ${TOP + PLOT_H} L${xs[0].toFixed(1)} ${TOP + PLOT_H} Z`;
  const ticks = dateTicks(first.date, last.date, width < 360 ? 3 : 4);
  const showDots = points.length <= 30;

  const nearest = (clientX: number, el: Element) => {
    const px = clientX - el.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
    return best;
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX, e.currentTarget));
  const onKey = (e: KeyboardEvent) => {
    const cur = active ?? points.length - 1;
    if (e.key === 'ArrowLeft') setActive(Math.max(0, active === null ? cur : cur - 1));
    else if (e.key === 'ArrowRight') setActive(Math.min(points.length - 1, active === null ? cur : cur + 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(points.length - 1);
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  const endY = ys[ys.length - 1];
  // La etiqueta del final va por el lado contrario al que llega la línea.
  const fromAbove = ys.length > 1 && ys[ys.length - 2] < endY;
  const below = endY + 22 <= TOP + PLOT_H && (fromAbove || endY - 14 < TOP + 4);
  const endLabelY = below ? endY + 22 : endY - 12;
  const goalY = goal !== undefined && goalIn ? y(goal) : null;
  const goalLabelY = goalY === null ? 0 : goalY - 6 < TOP + 4 ? goalY + 14 : goalY - 6;

  const a = active !== null ? points[active] : null;
  const tipLeft = active !== null ? Math.min(Math.max(xs[active], 70), width - 70) : 0;
  // La ficha va arriba o abajo, donde no tape el punto.
  const tipTop = active !== null && ys[active] < TOP + PLOT_H / 2 ? TOP + PLOT_H - 60 : TOP - 6;

  return (
    <div
      ref={wrap}
      className="line-chart"
      tabIndex={0}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      aria-label={`${label} Usa las flechas para ver cada medida.`}
    >
      {width > 0 && (
        <svg
          width={width}
          height={TOP + PLOT_H + AXIS_H}
          role="img"
          aria-label={label}
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        >
          {scale.ticks.map((t) => (
            <g key={t}>
              <line className="lc-grid" x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} />
              <text className="lc-tick" x={LEFT - 8} y={y(t) + 4} textAnchor="end">
                {fmtFixed(t, scale.decimals)}
              </text>
            </g>
          ))}
          {ticks.map((d) => (
            <text key={d} className="lc-tick" x={x(d)} y={TOP + PLOT_H + 18} textAnchor={x(d) < LEFT + 20 ? 'start' : x(d) > width - RIGHT - 20 ? 'end' : 'middle'}>
              {dateTickLabel(d, ticks, first.date, last.date)}
            </text>
          ))}

          {goalY !== null && (
            <g>
              <line className="lc-goal" x1={LEFT} x2={width - RIGHT} y1={goalY} y2={goalY} />
              <text className="lc-goal-label" x={LEFT + 6} y={goalLabelY}>
                Objetivo {fmt(goal!)}
              </text>
            </g>
          )}

          {goal !== undefined && !goalIn && (
            <text className="lc-goal-label" x={LEFT + 6} y={goal < vMin ? TOP + PLOT_H - 8 : TOP + 12}>
              {goal < vMin ? '↓' : '↑'} Objetivo {fmt(goal)}
            </text>
          )}
          <path className="lc-area" d={area} />
          <path className="lc-line" d={line} />
          {showDots && points.slice(0, -1).map((p, i) => <circle key={p.date} className="lc-dot" cx={xs[i]} cy={ys[i]} r={4} />)}
          <circle className="lc-dot end" cx={xs[xs.length - 1]} cy={endY} r={5} />
          {active === null && (
            <text className="lc-end-label" x={xs[xs.length - 1] - 8} y={endLabelY} textAnchor="end">
              {fmt(last.value)} {unit}
            </text>
          )}

          {a && (
            <g pointerEvents="none">
              <line className="lc-cross" x1={xs[active!]} x2={xs[active!]} y1={TOP} y2={TOP + PLOT_H} />
              <circle className="lc-dot end" cx={xs[active!]} cy={ys[active!]} r={6} />
            </g>
          )}
        </svg>
      )}
      {a && (
        <div className="lc-tip" style={{ left: tipLeft, top: tipTop }} aria-live="polite">
          <b>
            {fmt(a.value)} {unit}
          </b>
          <span>{formatShort(a.date)}</span>
          {active! > 0 && (
            <span>
              {(() => {
                const d = a.value - points[active! - 1].value;
                return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(Math.abs(d))} desde la anterior`;
              })()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
