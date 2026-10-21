import { ClipboardPaste, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AgendaRow } from '../components/AgendaRow';
import { confirmDialog, Empty, Progress, Segmented, Sheet, toast } from '../components/ui';
import { addDays, capitalize, daysBetween, formatDayMonth, formatRelative, todayISO } from '../lib/dates';
import { planForWeek } from '../store/selectors';
import { addPlanItems, clearPlan, restorePlanItems, useApp } from '../store/store';
import type { Area, PlanItem } from '../store/types';
import { moduleLabel } from '../store/templates';
import { ImportPlanSheet } from './ImportPlanSheet';

export function PlanModule({ area }: { area: Area }) {
  const state = useApp();
  const today = todayISO();
  const [view, setView] = useState<'next' | 'past'>('next');
  const [importing, setImporting] = useState<'claude' | 'paste' | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const isGym = area.template === 'gym';

  const items = useMemo(() => state.plan.filter((p) => p.areaId === area.id).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))), [state.plan, area.id]);
  const next = items.filter((p) => p.date >= today);
  const past = items.filter((p) => p.date < today).reverse();
  const week = planForWeek(state, area.id, today);
  const weekDone = week.filter((w) => w.done).length;
  const list = view === 'next' ? next : past;
  const visible = showAll ? list : list.slice(0, 14);

  const clearAll = async () => {
    const ok = await confirmDialog({ title: '¿Borrar todo el plan?', message: `Se borrarán las ${items.length} sesiones de ${area.name}.`, confirm: 'Borrar', danger: true });
    if (!ok) return;
    const copy = structuredClone(items);
    clearPlan(area.id);
    toast('Plan borrado', { action: 'Deshacer', onAction: () => restorePlanItems(copy) });
  };

  return (
    <div>
      {items.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700 }}>Esta semana</div>
            <div className="small" style={{ fontWeight: 700 }}>
              {weekDone}/{week.length} {week.length === 1 ? 'sesión' : 'sesiones'}
            </div>
          </div>
          <div className="mt8">
            <Progress value={weekDone} max={Math.max(week.length, 1)} />
          </div>
          {next[0] && (
            <div className="small muted mt8">
              Próxima: <b style={{ color: 'var(--text)' }}>{next[0].title}</b> · {formatRelative(next[0].date, today).toLowerCase()}
            </div>
          )}
        </div>
      )}

      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button className="btn secondary small" onClick={() => setImporting(isGym ? 'paste' : 'claude')}>
          {isGym ? <ClipboardPaste size={16} /> : <Sparkles size={16} />} {isGym ? 'Pegar WOD' : 'Importar de Claude'}
        </button>
        <button className="btn secondary small" onClick={() => setAdding(true)}>
          <Plus size={16} /> Añadir sesión
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <Empty
            emoji={isGym ? '🏋️' : area.template === 'running' ? '🏃' : '🗓️'}
            title={`Aún no hay ${moduleLabel(area, 'plan').toLowerCase()}`}
            text={
              isGym
                ? 'Copia el entrenamiento de la app de tu box y pégalo aquí. Si apuntas tus RM, verás los kilos de cada porcentaje.'
                : 'Pídele a Claude tu planificación en el formato de la app y la verás aquí día a día, y en Hoy lo que toca.'
            }
            action={
              <div className="stack" style={{ alignItems: 'center' }}>
                <button className="btn small" onClick={() => setImporting(isGym ? 'paste' : 'claude')}>
                  {isGym ? <ClipboardPaste size={16} /> : <Sparkles size={16} />} {isGym ? 'Pegar entrenamiento' : 'Importar desde Claude'}
                </button>
                {isGym && (
                  <button className="link-btn" onClick={() => setImporting('claude')}>
                    o importar una programación de Claude
                  </button>
                )}
              </div>
            }
          />
        </div>
      ) : (
        <>
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v);
              setShowAll(false);
            }}
            options={[
              { value: 'next', label: `Próximas (${next.length})` },
              { value: 'past', label: `Anteriores (${past.length})` },
            ]}
          />
          <div className="mt12">
            {visible.length === 0 ? (
              <div className="card small muted">{view === 'next' ? 'No hay sesiones a partir de hoy.' : 'Todavía no hay sesiones pasadas.'}</div>
            ) : (
              <GroupedPlan items={visible} area={area} today={today} />
            )}
          </div>
          {list.length > visible.length && (
            <button className="link-btn mt8" onClick={() => setShowAll(true)}>
              Ver {list.length - visible.length} más
            </button>
          )}
          <div className="hstack mt24" style={{ justifyContent: 'space-between' }}>
            {isGym ? (
              <button className="link-btn" onClick={() => setImporting('claude')}>
                <Sparkles size={15} style={{ verticalAlign: -2 }} /> Importar programación de Claude
              </button>
            ) : (
              <button className="link-btn" onClick={() => setImporting('paste')}>
                <ClipboardPaste size={15} style={{ verticalAlign: -2 }} /> Pegar texto
              </button>
            )}
            <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={clearAll}>
              <Trash2 size={15} style={{ verticalAlign: -2 }} /> Borrar plan
            </button>
          </div>
        </>
      )}

      {importing && <ImportPlanSheet area={area} mode={importing} onClose={() => setImporting(null)} />}
      {adding && <AddSessionSheet area={area} onClose={() => setAdding(false)} />}
    </div>
  );
}

function GroupedPlan({ items, area, today }: { items: PlanItem[]; area: Area; today: string }) {
  const groups: { date: string; items: PlanItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else groups.push({ date: it.date, items: [it] });
  }
  return (
    <div>
      {groups.map((g) => (
        <div key={g.date}>
          <div className={`day-head ${g.date === today ? 'today' : ''}`} style={{ marginTop: 12 }}>
            {capitalize(formatRelative(g.date, today))}
            {Math.abs(daysBetween(today, g.date)) <= 2 ? ` · ${formatDayMonth(g.date, today)}` : ''}
          </div>
          <div className="list">
            {g.items.map((p) => (
              <AgendaRow key={p.id} item={{ kind: 'plan', key: p.id, date: p.date, time: p.time, item: p, area, done: !!p.done }} showArea={false} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddSessionSheet({ area, onClose }: { area: Area; onClose: () => void }) {
  const today = todayISO();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [details, setDetails] = useState('');
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const save = () => {
    if (!title.trim() || !date) return;
    const items = Array.from({ length: repeatWeeks }, (_, i) => ({
      date: addDays(date, i * 7),
      title: title.trim(),
      time: time || undefined,
      details: details.trim() || undefined,
    }));
    addPlanItems(area.id, items);
    toast(items.length > 1 ? `${items.length} sesiones añadidas` : 'Sesión añadida');
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Nueva sesión"
      footer={
        <button className="btn block" onClick={save} disabled={!title.trim() || !date}>
          Guardar
        </button>
      }
    >
      <div className="field">
        <label htmlFor="as-title">Título</label>
        <input
          id="as-title"
          className="input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={area.template === 'running' ? 'Rodaje suave 6 km' : area.template === 'gym' ? 'WOD' : 'Tema 4: El Gótico'}
        />
      </div>
      <div className="two mt12">
        <div className="field">
          <label htmlFor="as-date">Fecha</label>
          <input id="as-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="as-time">Hora (opcional)</label>
          <input id="as-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="field mt12">
        <label htmlFor="as-details">Detalle (opcional)</label>
        <textarea id="as-details" className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="as-rep">Repetir</label>
        <select id="as-rep" className="select" value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))}>
          <option value={1}>Solo ese día</option>
          {[4, 8, 12, 16].map((n) => (
            <option key={n} value={n}>
              Cada semana durante {n} semanas
            </option>
          ))}
        </select>
      </div>
    </Sheet>
  );
}
