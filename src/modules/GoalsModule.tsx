import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { GoalRow } from '../components/GoalRow';
import { Empty, Segmented, Sheet, toast } from '../components/ui';
import { addDays, addMonths, localDay, monthKey, todayISO, weekKey } from '../lib/dates';
import { addGoal, bumpGoal, deleteGoal, goalValue, restoreGoal, updateGoal, useApp } from '../store/store';
import type { Area, Goal, GoalPeriod } from '../store/types';

const SUGGESTIONS: Record<string, string[]> = {
  studies: ['Estudiar 10 horas', 'Terminar un tema', 'Hacer 2 esquemas'],
  running: ['Salir a correr 3 veces', 'Correr 20 km', 'Estirar después de cada carrera'],
  gym: ['Ir al box 3 veces', 'Movilidad 2 días', 'Nuevo RM de peso muerto'],
  nutrition: ['Cumplir el menú 6 días', 'Beber 2 L de agua al día', 'Cocinar el domingo para la semana'],
  work: ['Cerrar 3 pendientes', 'Preparar las clases de la semana', 'Responder correos el viernes'],
};

function history(goal: Goal, today: string): { label: string; ok: boolean }[] {
  if (goal.period === 'once') return [];
  const out: { label: string; ok: boolean }[] = [];
  for (let i = 4; i >= 1; i--) {
    const d = goal.period === 'week' ? addDays(today, -7 * i) : addMonths(today, -i);
    const key = goal.period === 'week' ? weekKey(d) : monthKey(d);
    if (localDay(goal.createdAt) > d && (goal.progress[key] ?? 0) === 0) continue;
    out.push({ label: key, ok: (goal.progress[key] ?? 0) >= goal.target });
  }
  return out;
}

export function GoalsModule({ area }: { area: Area }) {
  const state = useApp();
  const today = todayISO();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const goals = state.goals.filter((g) => g.areaId === area.id && !g.archived);

  return (
    <div>
      {goals.length ? (
        <>
          <div className="list">
            {goals.map((g) => (
              <GoalRow key={g.id} goal={g} area={area} onEdit={() => setEditing(g)} date={today} />
            ))}
          </div>
          {goals.some((g) => history(g, today).length) && (
            <div className="card mt16">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Periodos anteriores</div>
              {goals
                .filter((g) => history(g, today).length)
                .map((g) => (
                  <div key={g.id} className="hstack small" style={{ padding: '4px 0' }}>
                    <span className="grow ellipsis">{g.title}</span>
                    <span aria-label="Historial">{history(g, today).map((h) => (h.ok ? '✅' : '▫️')).join(' ')}</span>
                  </div>
                ))}
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <Empty emoji="🎯" title="Sin objetivos todavía" text="Ponte un objetivo para la semana o el mes y ve sumando. También salen en Hoy." />
          <div className="chips" style={{ justifyContent: 'center' }}>
            {(SUGGESTIONS[area.template] ?? ['Objetivo de la semana']).map((s) => (
              <button key={s} className="chip mini" onClick={() => setEditing({ ...newGoal(area), title: s } as Goal)}>
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <button className="btn secondary block mt16" onClick={() => setEditing('new')}>
        <Plus size={18} /> Nuevo objetivo
      </button>
      {editing && <GoalSheet area={area} goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function newGoal(area: Area): Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'progress'> {
  return { areaId: area.id, title: '', target: 1, period: 'week' };
}

function GoalSheet({ area, goal, onClose }: { area: Area; goal: Goal | null; onClose: () => void }) {
  const existing = goal?.id ? goal : null;
  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<'check' | 'count'>((goal?.target ?? 1) > 1 || goal?.unit ? 'count' : guessCount(goal?.title ?? '') ? 'count' : 'check');
  const [target, setTarget] = useState(String(goal && goal.target > 1 ? goal.target : (guessCount(goal?.title ?? '') ?? 3)));
  const [unit, setUnit] = useState(goal?.unit ?? guessUnit(goal?.title ?? ''));
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'week');
  const [amount, setAmount] = useState('');

  const save = () => {
    if (!title.trim()) return;
    const t = kind === 'check' ? 1 : Math.max(1, Number(target.replace(',', '.')) || 1);
    const data = { title: title.trim(), target: t, unit: kind === 'count' ? unit.trim() || undefined : undefined, period };
    if (existing) updateGoal(existing.id, data);
    else addGoal({ ...data, areaId: area.id });
    toast('Objetivo guardado');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? 'Objetivo' : 'Nuevo objetivo'}
      headerExtra={
        existing && (
          <button
            className="icon-btn small"
            aria-label="Borrar"
            onClick={() => {
              const copy = structuredClone(existing);
              deleteGoal(existing.id);
              onClose();
              toast('Objetivo borrado', { action: 'Deshacer', onAction: () => restoreGoal(copy) });
            }}
          >
            <Trash2 size={16} />
          </button>
        )
      }
      footer={
        <button className="btn block" onClick={save} disabled={!title.trim()}>
          Guardar
        </button>
      }
    >
      {existing && kind === 'count' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700 }}>
            Llevas {goalValue(existing)} de {existing.target} {existing.unit ?? ''}
          </div>
          <form
            className="hstack mt8"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(amount.replace(',', '.'));
              if (!n) return;
              bumpGoal(existing.id, n);
              setAmount('');
              toast(`+${n} ${existing.unit ?? ''} apuntado`);
            }}
          >
            <input className="input grow" inputMode="decimal" placeholder="Sumar cantidad (ej. 5,5)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn small" type="submit" disabled={!amount}>
              Sumar
            </button>
          </form>
        </div>
      )}
      <div className="field">
        <label htmlFor="g-title">¿Qué quieres conseguir?</label>
        <input
          id="g-title"
          className="input"
          value={title}
          autoFocus={!existing}
          onChange={(e) => {
            setTitle(e.target.value);
            const n = guessCount(e.target.value);
            if (n && !existing) {
              setKind('count');
              setTarget(String(n));
              setUnit(guessUnit(e.target.value));
            }
          }}
          placeholder="Ej. Correr 3 veces"
        />
      </div>
      <div className="field">
        <span className="label">Tipo</span>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'check', label: 'Sí / no' },
            { value: 'count', label: 'Contar' },
          ]}
        />
      </div>
      {kind === 'count' && (
        <div className="two mt12">
          <div className="field">
            <label htmlFor="g-target">Meta</label>
            <input id="g-target" className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="g-unit">Unidad (opcional)</label>
            <input id="g-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="veces, km, horas…" />
          </div>
        </div>
      )}
      <div className="field mt12">
        <span className="label">Cada cuánto</span>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: 'Semanal' },
            { value: 'month', label: 'Mensual' },
            { value: 'once', label: 'Una vez' },
          ]}
        />
        <p className="hint">{period === 'once' ? 'Un objetivo sin fecha, que se completa una vez.' : `Se reinicia cada ${period === 'week' ? 'lunes' : 'día 1'}.`}</p>
      </div>
    </Sheet>
  );
}

// "Correr 3 veces", "20 km", "Cerrar 3 pendientes" → meta y unidad
const COUNT_RE = /(\d+(?:[.,]\d+)?)\s*([a-záéíóúñ]+)?/i;

function guessCount(t: string): number | undefined {
  const m = COUNT_RE.exec(t);
  const n = m ? Number(m[1].replace(',', '.')) : NaN;
  return n > 1 ? n : undefined;
}

function guessUnit(t: string): string {
  const m = COUNT_RE.exec(t);
  const u = (m?.[2] ?? '').toLowerCase();
  if (!u) return '';
  return u === 'h' ? 'horas' : u === 'kms' || u.startsWith('kil') ? 'km' : u === 'l' ? 'litros' : u;
}
