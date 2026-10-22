import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { confirmDialog, Empty, SectionHead, Sheet, toast } from '../components/ui';
import { addDays, capitalize, formatShort, localDay, startOfWeek, WEEKDAY_LETTERS } from '../lib/dates';
import { bestStreak, completion, countOn, daysLabel, doneOn, FREEZE_EVERY, scheduled, streak, streakInfo } from '../lib/habits';
import { useToday } from '../lib/useToday';
import { deleteHabit, moveHabit, restoreHabit, saveHabit, setHabitCount, useApp } from '../store/store';
import { AREA_COLORS } from '../store/templates';
import type { AreaColor, Habit, ISODate } from '../store/types';

const EMOJIS = ['💧', '📚', '🧘', '🏃', '🚶', '💪', '🥗', '🍎', '😴', '📵', '✍️', '🎸', '🧹', '💊', '🙏', '🌿', '☀️', '🦷', '💰', '🧠', '❤️', '🐶', '🎨', '🇬🇧'];

const PRESETS: { name: string; emoji: string; target: number; unit?: string; color: AreaColor }[] = [
  { name: 'Beber agua', emoji: '💧', target: 8, unit: 'vasos', color: 'blue' },
  { name: 'Leer', emoji: '📚', target: 1, color: 'violet' },
  { name: 'Estirar', emoji: '🧘', target: 1, color: 'teal' },
  { name: 'Caminar 10.000 pasos', emoji: '🚶', target: 1, color: 'green' },
  { name: 'Fruta', emoji: '🍎', target: 3, unit: 'piezas', color: 'rose' },
  { name: 'Sin móvil en la cama', emoji: '📵', target: 1, color: 'slate' },
  { name: 'Vitaminas', emoji: '💊', target: 1, color: 'amber' },
  { name: 'Inglés', emoji: '🇬🇧', target: 1, color: 'orange' },
];

/** Tocar un hábito: si es de sí/no, lo marca o desmarca; si es de veces, suma una. */
function tap(h: Habit, log: Record<ISODate, number> | undefined, date: ISODate) {
  const n = countOn(log, date);
  if (h.target <= 1) setHabitCount(h.id, date, n ? 0 : 1);
  else setHabitCount(h.id, date, n + 1);
  if (navigator.vibrate) navigator.vibrate(8);
}

function HabitPill({ h, log, date }: { h: Habit; log: Record<ISODate, number> | undefined; date: ISODate }) {
  const n = countOn(log, date);
  const done = n >= h.target;
  const s = streak(h, log, date);
  return (
    <div className={`habit-pill tone-${h.color} ${done ? 'done' : ''}`}>
      <button className="hp-main" onClick={() => tap(h, log, date)} aria-label={`${h.name}: ${h.target > 1 ? `${n} de ${h.target}` : done ? 'hecho' : 'sin hacer'}`}>
        <span className="habit-ring" style={{ '--p': Math.min(1, n / h.target) } as CSSProperties}>
          <span>{h.emoji}</span>
        </span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="hn">{h.name}</span>
          <span className="hc">
            {h.target > 1 ? `${n}/${h.target}${h.unit ? ` ${h.unit}` : ''}` : done ? 'Hecho ✓' : 'Toca cuando lo hagas'}
            {s > 1 && <span className="hs"> · 🔥 {s}</span>}
          </span>
        </span>
      </button>
      {h.target > 1 && n > 0 && (
        <button className="icon-btn small plain hp-minus" aria-label={`Quitar uno de ${h.name}`} onClick={() => setHabitCount(h.id, date, n - 1)}>
          <Minus size={15} />
        </button>
      )}
    </div>
  );
}

/** Los hábitos que tocan hoy, en la pantalla Hoy. */
export function HabitsToday({ today }: { today: ISODate }) {
  const state = useApp();
  const [manage, setManage] = useState(false);
  const habits = [...state.habits].filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const due = habits.filter((h) => scheduled(h, today));
  const doneCount = due.filter((h) => doneOn(h, state.habitLog[h.id], today)).length;
  return (
    <div className="section">
      <SectionHead
        title={
          <>
            ✅ Hábitos{' '}
            {due.length > 0 && (
              <span className="count">
                {doneCount}/{due.length}
              </span>
            )}
          </>
        }
        action={
          <button className="link-btn" onClick={() => setManage(true)}>
            {habits.length ? 'Editar' : 'Crear'}
          </button>
        }
      />
      {due.length ? (
        <div className="habit-grid">
          {due.map((h) => (
            <HabitPill key={h.id} h={h} log={state.habitLog[h.id]} date={today} />
          ))}
        </div>
      ) : (
        <button className="card hstack" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => setManage(true)}>
          <span style={{ fontSize: 'calc(22px * var(--fs))' }}>✅</span>
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{habits.length ? 'Hoy no toca ningún hábito' : 'Crea tus hábitos'}</div>
            <div className="small muted">{habits.length ? 'Disfruta del día libre.' : 'Beber agua, leer, estirar… Los marcas cada día y ves tu racha.'}</div>
          </div>
        </button>
      )}
      {manage && <HabitsSheet onClose={() => setManage(false)} />}
    </div>
  );
}

/** Bloque de un área con todos los hábitos y cómo van. */
export function HabitsModule() {
  const state = useApp();
  const today = useToday();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const habits = [...state.habits].sort((a, b) => a.order - b.order);
  return (
    <div>
      <button className="btn block" onClick={() => setEditing('new')}>
        <Plus size={18} /> Nuevo hábito
      </button>
      {habits.length === 0 && (
        <div className="card mt12">
          <Empty emoji="✅" title="Sin hábitos todavía" text="Lo que quieras hacer a menudo: beber agua, leer, estirar… Lo marcas en Hoy y aquí ves cómo vas." />
        </div>
      )}
      {habits.map((h) => {
        const log = state.habitLog[h.id];
        const c = completion(h, log, addDays(today, -29), today);
        return (
          <div key={h.id} className={`card mt12 tone-${h.color}`} role="button" tabIndex={0} onClick={() => setEditing(h)} style={{ cursor: 'pointer' }}>
            <div className="hstack">
              <span style={{ fontSize: 'calc(24px * var(--fs))' }}>{h.emoji}</span>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{h.name}</div>
                <div className="small muted">
                  {daysLabel(h.days)}
                  {h.target > 1 ? ` · ${h.target}${h.unit ? ` ${h.unit}` : ' veces'} al día` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 750 }}>🔥 {streak(h, log, today)}</div>
                <div className="tiny muted">{c.due ? `${Math.round((c.done / c.due) * 100)} % en 30 días` : 'Recién creado'}</div>
              </div>
            </div>
            <HabitHistory h={h} log={log} today={today} weeks={12} />
          </div>
        );
      })}
      {editing && <HabitSheet habit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Las últimas semanas, un cuadro por día. */
function HabitHistory({ h, log, today, weeks }: { h: Habit; log: Record<ISODate, number> | undefined; today: ISODate; weeks: number }) {
  const first = addDays(startOfWeek(today), -7 * (weeks - 1));
  const created = localDay(h.createdAt);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  // Los días sueltos que no rompieron la racha
  const saved = new Set(streakInfo(h, log, today).freezes);
  return (
    <div className="habit-history mt12" aria-label={`Últimas ${weeks} semanas de ${h.name}`}>
      <div className="hh-days" aria-hidden>
        {WEEKDAY_LETTERS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="hh-grid">
        {cols.map((col, w) => (
          <div key={w} className="hh-col">
            {col.map((d) => {
              const n = countOn(log, d);
              const state = d > today ? 'future' : !scheduled(h, d) || d < created ? 'off' : n >= h.target ? 'done' : saved.has(d) ? 'saved' : n > 0 ? 'part' : 'miss';
              const label = { future: '', off: 'no tocaba', done: 'hecho', part: `${n} de ${h.target}`, miss: 'no', saved: 'no, pero la racha sigue' }[state];
              return <span key={d} className={`hh-cell ${state}`} title={state === 'future' ? undefined : `${capitalize(formatShort(d))}: ${label}`} />;
            })}
          </div>
        ))}
      </div>
      <div className="hh-legend" aria-hidden>
        <span>
          <i className="hh-cell done" /> Hecho
        </span>
        {h.target > 1 && (
          <span>
            <i className="hh-cell part" /> A medias
          </span>
        )}
        <span>
          <i className="hh-cell miss" /> No
        </span>
        {saved.size > 0 && (
          <span>
            <i className="hh-cell saved" /> Comodín
          </span>
        )}
        <span>
          <i className="hh-cell off" /> No tocaba
        </span>
      </div>
    </div>
  );
}

/** Lista para ordenar y editar los hábitos (desde Hoy). */
function HabitsSheet({ onClose }: { onClose: () => void }) {
  const state = useApp();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const habits = [...state.habits].sort((a, b) => a.order - b.order);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Hábitos"
      footer={
        <button className="btn block secondary" onClick={() => setEditing('new')}>
          <Plus size={18} /> Nuevo hábito
        </button>
      }
    >
      {habits.length ? (
        <div className="list flat">
          {habits.map((h, i) => (
            <div key={h.id} className="row no-lead">
              <button className="body" style={{ border: 0, background: 'none', textAlign: 'left', padding: 0 }} onClick={() => setEditing(h)}>
                <div className="title">
                  {h.emoji} {h.name}
                </div>
                <div className="meta">
                  <span>{daysLabel(h.days)}</span>
                  {h.target > 1 && <span>{h.target} al día</span>}
                </div>
              </button>
              <button className="icon-btn small plain" aria-label={`Subir ${h.name}`} disabled={i === 0} onClick={() => moveHabit(h.id, -1)}>
                <ArrowUp size={16} />
              </button>
              <button className="icon-btn small plain" aria-label={`Bajar ${h.name}`} disabled={i === habits.length - 1} onClick={() => moveHabit(h.id, 1)}>
                <ArrowDown size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty emoji="✅" title="Sin hábitos todavía" text="Elige uno de los de abajo o crea el tuyo." />
      )}
      {editing && <HabitSheet habit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}

export function HabitSheet({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const state = useApp();
  const today = useToday();
  const [name, setName] = useState(habit?.name ?? '');
  const [emoji, setEmoji] = useState(habit?.emoji ?? '✅');
  const [color, setColor] = useState<AreaColor>(habit?.color ?? 'green');
  const [counted, setCounted] = useState((habit?.target ?? 1) > 1);
  const [target, setTarget] = useState(String(Math.max(2, habit?.target ?? 8)));
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [days, setDays] = useState<number[]>(habit?.days ?? []);
  const n = Number(target);
  const valid = !!name.trim() && (!counted || (n >= 2 && n <= 99));
  const log = habit ? state.habitLog[habit.id] : undefined;

  const save = () => {
    if (!valid) return;
    saveHabit({ id: habit?.id, name: name.trim(), emoji, color, days: days.length === 7 ? [] : [...days].sort(), target: counted ? n : 1, unit: counted ? unit.trim() || undefined : undefined });
    toast(habit ? 'Hábito guardado' : `${emoji} ${name.trim()}: a por ello`);
    onClose();
  };
  const remove = async () => {
    if (!habit) return;
    const ok = await confirmDialog({ title: `¿Borrar «${habit.name}»?`, message: 'Se borra con todo lo marcado.', confirm: 'Borrar', danger: true });
    if (!ok) return;
    const saved = state.habitLog[habit.id];
    deleteHabit(habit.id);
    onClose();
    toast('Hábito borrado', { action: 'Deshacer', onAction: () => restoreHabit(habit, saved) });
  };
  const toggleDay = (d: number) => setDays((cur) => (cur.length === 0 ? [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== d) : cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title={habit ? habit.name : 'Nuevo hábito'}
      headerExtra={
        habit ? (
          <button className="icon-btn small" aria-label="Borrar hábito" onClick={remove}>
            <Trash2 size={16} />
          </button>
        ) : undefined
      }
      footer={
        <button className="btn block" disabled={!valid} onClick={save}>
          Guardar
        </button>
      }
    >
      {habit && (
        <div className={`card tone-${habit.color}`} style={{ marginBottom: 16 }}>
          <div className="hstack" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <div style={{ fontWeight: 750, fontSize: 'calc(22px * var(--fs))' }}>🔥 {streak(habit, log, today)}</div>
              <div className="tiny muted">Racha</div>
            </div>
            <div>
              <div style={{ fontWeight: 750, fontSize: 'calc(22px * var(--fs))' }}>{bestStreak(habit, log, today)}</div>
              <div className="tiny muted">Mejor racha</div>
            </div>
            <div>
              <div style={{ fontWeight: 750, fontSize: 'calc(22px * var(--fs))' }}>
                {(() => {
                  const c = completion(habit, log, addDays(today, -29), today);
                  return c.due ? `${Math.round((c.done / c.due) * 100)} %` : '—';
                })()}
              </div>
              <div className="tiny muted">Últimos 30 días</div>
            </div>
          </div>
          {(() => {
            const used = streakInfo(habit, log, today).freezes[0];
            return (
              <p className="tiny muted center" style={{ margin: '8px 0 0' }}>
                {used
                  ? `🛡️ El ${formatShort(used)} no lo hiciste, pero la racha sigue: era un fallo suelto.`
                  : `🛡️ Un día suelto sin hacer no rompe la racha (uno cada ${FREEZE_EVERY} veces que toca).`}
              </p>
            );
          })()}
          <HabitHistory h={habit} log={log} today={today} weeks={16} />
        </div>
      )}

      {!habit && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className={`chip mini ${name === p.name ? 'on' : ''}`}
              onClick={() => {
                setName(p.name);
                setEmoji(p.emoji);
                setColor(p.color);
                setCounted(p.target > 1);
                if (p.target > 1) setTarget(String(p.target));
                setUnit(p.unit ?? '');
              }}
            >
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor="hb-name">Nombre</label>
        <input id="hb-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leer 20 minutos" />
      </div>
      <div className="field">
        <span className="label">Icono</span>
        <div className="emoji-grid">
          {Array.from(new Set([emoji, ...EMOJIS])).map((e) => (
            <button key={e} type="button" className={emoji === e ? 'on' : ''} onClick={() => setEmoji(e)} aria-label={`Icono ${e}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Color</span>
        <div className="color-row">
          {AREA_COLORS.map((c) => (
            <button key={c} type="button" className={`color-dot tone-${c} ${color === c ? 'on' : ''}`} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Qué días · {daysLabel(days)}</span>
        <div className="week-strip">
          {WEEKDAY_LETTERS.map((l, d) => {
            const on = days.length === 0 || days.includes(d);
            return (
              <button key={l} className={`day-pill ${on ? 'on' : ''}`} onClick={() => toggleDay(d)} aria-pressed={on}>
                <span className="n" style={{ fontSize: 'calc(16px * var(--fs))' }}>
                  {l}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="switch-row">
        <div className="grow">
          <div className="t">Varias veces al día</div>
          <div className="d">Para contar (8 vasos de agua, 3 piezas de fruta…).</div>
        </div>
        <span className="switch">
          <input type="checkbox" checked={counted} onChange={(e) => setCounted(e.target.checked)} />
          <span />
        </span>
      </label>
      {counted && (
        <div className="two">
          <div className="field">
            <label htmlFor="hb-target">Cuántas</label>
            <input id="hb-target" className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="hb-unit">De qué (opcional)</label>
            <input id="hb-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="vasos" />
          </div>
        </div>
      )}
    </Sheet>
  );
}
