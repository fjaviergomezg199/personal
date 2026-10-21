import { TriangleAlert } from 'lucide-react';
import { fmt0 as fmt } from '../lib/num';
import type { Macros, NutritionTargets } from '../store/types';

function Meter({ value, max, over }: { value: number; max: number; over: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`meter ${over ? 'over' : ''}`} role="meter" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)} aria-valuemin={0}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

const MACROS: { key: keyof Omit<Macros, 'kcal'>; label: string; warnOver: boolean }[] = [
  { key: 'protein', label: 'Proteína', warnOver: false },
  { key: 'carbs', label: 'Hidratos', warnOver: true },
  { key: 'fat', label: 'Grasa', warnOver: true },
];

/** Calorías (cifra grande + medidor) y los tres macros frente al objetivo del día. */
export function MacroSummary({ total, targets, compact }: { total: Macros; targets: NutritionTargets; compact?: boolean }) {
  const kcalTarget = targets.kcal ?? 0;
  const kcalOver = kcalTarget > 0 && total.kcal > kcalTarget * 1.05;
  return (
    <div className={`macro-summary ${compact ? 'compact' : ''}`}>
      <div className="ms-head">
        <div>
          <div className="ms-label">Calorías</div>
          <div className="ms-hero">
            {fmt(total.kcal)}
            <span className="ms-of">{kcalTarget ? ` / ${fmt(kcalTarget)} kcal` : ' kcal'}</span>
          </div>
        </div>
        {kcalTarget > 0 && (
          <div className="ms-left">
            {kcalOver ? (
              <span className="ms-warn">
                <TriangleAlert size={14} /> Te pasas {fmt(total.kcal - kcalTarget)}
              </span>
            ) : (
              <>Quedan {fmt(Math.max(0, kcalTarget - total.kcal))}</>
            )}
          </div>
        )}
      </div>
      {kcalTarget > 0 && <Meter value={total.kcal} max={kcalTarget} over={kcalOver} />}
      <div className="ms-macros">
        {MACROS.map((m) => {
          const target = targets[m.key] ?? 0;
          const over = m.warnOver && target > 0 && total[m.key] > target * 1.1;
          return (
            <div key={m.key} className="ms-row">
              <span className="ms-name">{m.label}</span>
              <span className="ms-val">
                {fmt(total[m.key])}
                {target ? ` / ${fmt(target)}` : ''} g
              </span>
              {target > 0 && <Meter value={total[m.key]} max={target} over={over} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
