import { Minus, Plus } from 'lucide-react';
import { formatKg } from '../lib/lifts';
import { bumpGoal, goalValue } from '../store/store';
import type { Area, Goal } from '../store/types';
import { Check, Progress } from './ui';

const PERIOD: Record<Goal['period'], string> = { week: 'esta semana', month: 'este mes', once: '' };

export function GoalRow({ goal, area, onEdit, date }: { goal: Goal; area?: Area; onEdit?: () => void; date?: string }) {
  const value = goalValue(goal, date);
  const done = value >= goal.target;
  const tone = area ? `tone-${area.color}` : 'tone-primary';
  const step = 1;
  if (goal.target <= 1) {
    return (
      <div className={`row ${done ? 'done' : ''} ${tone} ${onEdit ? 'tappable' : ''}`} onClick={onEdit} role={onEdit ? 'button' : undefined}>
        <div className="lead">
          <Check on={done} onChange={() => bumpGoal(goal.id, done ? -value : 1, date)} />
        </div>
        <div className="body">
          <div className="title">{goal.title}</div>
          <div className="meta">
            {area && <span>{area.emoji} {area.name}</span>}
            {PERIOD[goal.period] && <span>{PERIOD[goal.period]}</span>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`row ${tone} ${onEdit ? 'tappable' : ''}`} onClick={onEdit} role={onEdit ? 'button' : undefined}>
      <div className="lead" aria-hidden>
        {done ? '🏆' : '🎯'}
      </div>
      <div className="body">
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <div className="title">{goal.title}</div>
          <div className="small" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {formatKg(value)}/{formatKg(goal.target)}
            {goal.unit ? ` ${goal.unit}` : ''}
          </div>
        </div>
        <div style={{ margin: '7px 0 3px' }}>
          <Progress value={value} max={goal.target} />
        </div>
        <div className="meta">
          {area && <span>{area.emoji} {area.name}</span>}
          {PERIOD[goal.period] && <span>{PERIOD[goal.period]}</span>}
        </div>
      </div>
      <div className="trail">
        <button
          className="icon-btn small"
          aria-label="Restar"
          onClick={(e) => {
            e.stopPropagation();
            bumpGoal(goal.id, -step, date);
          }}
          disabled={value <= 0}
        >
          <Minus size={16} />
        </button>
        <button
          className="icon-btn small primary"
          aria-label="Sumar"
          onClick={(e) => {
            e.stopPropagation();
            if (navigator.vibrate) navigator.vibrate(8);
            bumpGoal(goal.id, step, date);
          }}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
