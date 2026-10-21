import { useMemo } from 'react';
import { annotateWorkout, formatKg } from '../lib/lifts';
import { renderMarkdown } from '../lib/markdown';
import type { Area } from '../store/types';

/** Texto de una sesión: si el área tiene RM, añade los kilos a cada %. */
export function SessionText({ text, area }: { text: string; area?: Area }) {
  const lifts = area?.lifts ?? [];
  const lines = useMemo(() => (lifts.length ? annotateWorkout(text, lifts, area?.rounding ?? 2.5) : null), [text, lifts, area?.rounding]);
  const html = useMemo(() => (lines ? '' : renderMarkdown(text)), [lines, text]);
  if (!lines) return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className="wod">
      {lines.map((l, i) => (
        <div className="wod-line" key={i}>
          {l.text || ' '}
          {l.loads.map((ld, j) => (
            <span key={j} className={`kg badge tone-${area?.color ?? 'primary'}`} title={`${ld.liftName}: RM ${formatKg(lifts.find((x) => x.id === ld.liftId)?.rm ?? 0)} kg`}>
              {ld.pct2 !== undefined ? `${formatKg(ld.kg)}–${formatKg(ld.kg2!)} kg` : `${formatKg(ld.kg)} kg`}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function hasLoads(text: string, area?: Area): boolean {
  if (!area?.lifts?.length) return false;
  return annotateWorkout(text, area.lifts, area.rounding ?? 2.5).some((l) => l.loads.length > 0);
}
