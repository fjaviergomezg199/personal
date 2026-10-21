import { ArrowDown, ArrowUp, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { LineChart } from '../components/LineChart';
import { confirmDialog, Empty, Segmented, Sheet, toast } from '../components/ui';
import { formatDayMonth, formatRelative, formatShort, todayISO } from '../lib/dates';
import { changeOver, goalDirection, goalProgress, RANGES, rangeStart, seriesFor, type RangeKey } from '../lib/metrics';
import { fmtFixed, parseDecimal, toInput } from '../lib/num';
import { fold } from '../lib/quickParse';
import { useToday } from '../lib/useToday';
import { deleteMetricEntry, deleteMetricType, restoreMetricEntry, saveMetricEntry, saveMetricType, useApp } from '../store/store';
import type { Area, MetricEntry, MetricType } from '../store/types';

const PRESETS: Omit<MetricType, 'id'>[] = [
  { name: 'Peso', unit: 'kg', decimals: 1 },
  { name: 'Cintura', unit: 'cm', decimals: 1 },
  { name: 'Cadera', unit: 'cm', decimals: 1 },
  { name: 'Grasa corporal', unit: '%', decimals: 1 },
  { name: 'Masa muscular', unit: 'kg', decimals: 1 },
  { name: 'Pecho', unit: 'cm', decimals: 1 },
  { name: 'Brazo', unit: 'cm', decimals: 1 },
  { name: 'Muslo', unit: 'cm', decimals: 1 },
  { name: 'Pulso en reposo', unit: 'ppm', decimals: 0 },
];

/** Signo de verdad («−1,2») para los cambios. */
const signed = (v: number, decimals: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtFixed(Math.abs(v), decimals)}`;

function Delta({ value, decimals, unit, good }: { value: number; decimals: number; unit: string; good: boolean | null }) {
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  return (
    <span className={`delta ${good ? 'good' : ''}`}>
      <Icon size={15} strokeWidth={2.6} aria-hidden />
      {signed(value, decimals)} {unit}
    </span>
  );
}

/** Peso y otras medidas: apuntarlas y ver cómo evolucionan. */
export function MetricsModule({ area: _area }: { area: Area }) {
  const state = useApp();
  const today = useToday();
  const types = state.metricTypes;
  const [metricId, setMetricId] = useState(types[0]?.id);
  const [range, setRange] = useState<RangeKey>('3M');
  const [entrySheet, setEntrySheet] = useState<{ entry?: MetricEntry } | null>(null);
  const [typeSheet, setTypeSheet] = useState<{ type?: MetricType } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const type = types.find((t) => t.id === metricId) ?? types[0];

  const all = useMemo(() => (type ? seriesFor(state.metrics, type.id) : []), [state.metrics, type]);
  const from = rangeStart(range, today);
  const points = useMemo(() => (from ? all.filter((e) => e.date >= from) : all), [all, from]);

  if (!type) {
    return (
      <div className="card">
        <Empty
          emoji="⚖️"
          title="Sin medidas"
          text="Añade el peso o cualquier otra medida que quieras seguir."
          action={
            <button className="btn small" onClick={() => setTypeSheet({})}>
              <Plus size={16} /> Añadir medida
            </button>
          }
        />
        {typeSheet && <MetricTypeSheet type={typeSheet.type} onClose={() => setTypeSheet(null)} onSaved={setMetricId} />}
      </div>
    );
  }

  const last = all[all.length - 1];
  const start = all[0];
  const dir = goalDirection(type.goal, start?.value);
  const change = changeOver(points);
  const isGood = (v: number) => (dir === 0 || v === 0 ? null : Math.sign(v) === dir);
  const reached = type.goal !== undefined && last && dir !== 0 && (dir < 0 ? last.value <= type.goal : last.value >= type.goal);
  const rows = [...points].reverse();
  const position = new Map(all.map((e, i) => [e.id, i]));
  const shown = showAll ? rows : rows.slice(0, 20);
  const lower = type.name.toLowerCase();

  return (
    <div>
      <div className="chips scroll" style={{ marginBottom: 12 }}>
        {types.map((t) => (
          <button key={t.id} className={`chip ${t.id === type.id ? 'on' : ''}`} onClick={() => setMetricId(t.id)} aria-pressed={t.id === type.id}>
            {t.name}
          </button>
        ))}
        <button className="chip" onClick={() => setTypeSheet({})}>
          <Plus size={15} /> Medida
        </button>
      </div>

      <button className="btn block" onClick={() => setEntrySheet({})}>
        <Plus size={18} /> Apuntar {lower}
      </button>

      {!last ? (
        <div className="card mt12">
          <Empty
            emoji="📈"
            title={`Aún no has apuntado tu ${lower}`}
            text="Apúntalo cada cierto tiempo (por ejemplo, una vez a la semana, en ayunas) y aquí verás cómo evoluciona."
          />
        </div>
      ) : (
        <>
          <div className="mt16 seg-compact">
            <Segmented value={range} onChange={setRange} options={RANGES} />
          </div>

          <div className="card mt12">
            <div className="hstack" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="stat-label">{type.name} actual</div>
                <div className="stat-hero">
                  {fmtFixed(last.value, type.decimals)}
                  <span className="stat-unit"> {type.unit}</span>
                </div>
                <div className="small muted">{last.date === today ? 'Apuntado hoy' : `${formatRelative(last.date, today)}`}</div>
              </div>
              <button className="icon-btn small" aria-label={`Ajustes de ${lower}`} onClick={() => setTypeSheet({ type })}>
                <Pencil size={15} />
              </button>
            </div>

            <div className="stat-row">
              <div className="stat">
                <div className="stat-label">Cambio</div>
                {change ? (
                  <>
                    <div className="stat-value">
                      <Delta value={change.delta} decimals={type.decimals} unit={type.unit} good={isGood(change.delta)} />
                    </div>
                    <div className="tiny muted">
                      desde el {formatDayMonth(change.from, today)}
                      {change.perWeek !== undefined ? ` · ${signed(change.perWeek, type.decimals === 0 ? 1 : type.decimals)}/semana` : ''}
                    </div>
                  </>
                ) : (
                  <div className="small muted">Falta otra medida en este periodo</div>
                )}
              </div>
              <div className="stat">
                <div className="stat-label">Objetivo</div>
                {type.goal !== undefined ? (
                  <>
                    <div className="stat-value">
                      {fmtFixed(type.goal, type.decimals)} {type.unit}
                    </div>
                    <div className="tiny muted">
                      {reached ? '¡Conseguido! 🎉' : `Faltan ${fmtFixed(Math.abs(type.goal - last.value), type.decimals)} ${type.unit}`}
                    </div>
                    {dir !== 0 && start && (
                      <div className="meter mt8" role="meter" aria-label="Camino hecho hacia el objetivo" aria-valuenow={Math.round(goalProgress(start.value, last.value, type.goal) * 100)} aria-valuemin={0} aria-valuemax={100}>
                        <div style={{ width: `${goalProgress(start.value, last.value, type.goal) * 100}%` }} />
                      </div>
                    )}
                  </>
                ) : (
                  <button className="link-btn small" style={{ padding: 0 }} onClick={() => setTypeSheet({ type })}>
                    Poner objetivo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="card mt12">
            <div className="stat-label" style={{ marginBottom: 6 }}>
              Evolución
            </div>
            {points.length >= 2 ? (
              <LineChart key={`${type.id}-${range}`} points={points} goal={type.goal} unit={type.unit} decimals={type.decimals} name={lower} />
            ) : (
              <p className="small muted" style={{ margin: '8px 0' }}>
                {points.length === 1 ? 'Con otra medida más verás la gráfica.' : 'No hay medidas en este periodo.'}
              </p>
            )}
          </div>

          {rows.length > 0 && (
            <div className="section">
              <div className="section-head">
                <h2>Registro</h2>
              </div>
              <div className="list">
                {shown.map((e) => {
                  const prev = all[(position.get(e.id) ?? 0) - 1];
                  const d = prev ? e.value - prev.value : null;
                  return (
                    <button key={e.id} className="row tappable no-lead metric-row" onClick={() => setEntrySheet({ entry: e })}>
                      <div className="body">
                        <div className="title">{formatShort(e.date)}</div>
                        {e.note && <div className="meta">{e.note}</div>}
                      </div>
                      <div className="mv">
                        {fmtFixed(e.value, type.decimals)} {type.unit}
                      </div>
                      <div className="md">{d !== null && d !== 0 ? <Delta value={d} decimals={type.decimals} unit="" good={isGood(d)} /> : d === 0 ? '=' : ''}</div>
                    </button>
                  );
                })}
              </div>
              {rows.length > 20 && (
                <button className="link-btn mt8" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Ver menos' : `Ver las ${rows.length} medidas`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {entrySheet && <MetricEntrySheet type={type} entry={entrySheet.entry} last={last} onClose={() => setEntrySheet(null)} />}
      {typeSheet && <MetricTypeSheet type={typeSheet.type} onClose={() => setTypeSheet(null)} onSaved={setMetricId} />}
    </div>
  );
}

function MetricEntrySheet({ type, entry, last, onClose }: { type: MetricType; entry?: MetricEntry; last?: MetricEntry; onClose: () => void }) {
  const state = useApp();
  const today = todayISO();
  const [value, setValue] = useState(entry ? toInput(entry.value) : '');
  const [date, setDate] = useState(entry?.date ?? today);
  const [note, setNote] = useState(entry?.note ?? '');
  const v = parseDecimal(value);
  const valid = v !== null && v > 0 && !!date;
  const clash = state.metrics.find((m) => m.metricId === type.id && m.date === date && m.id !== entry?.id);
  const step = 10 ** -type.decimals;
  const base = v ?? last?.value;
  const bump = (d: number) => base !== undefined && setValue(toInput(Number((base + d).toFixed(type.decimals))));

  const save = () => {
    if (!valid) return;
    saveMetricEntry({ id: entry?.id, metricId: type.id, date, value: v!, note: note.trim() || undefined });
    toast(`${type.name}: ${fmtFixed(v!, type.decimals)} ${type.unit}`);
    onClose();
  };
  const remove = () => {
    if (!entry) return;
    deleteMetricEntry(entry.id);
    onClose();
    toast('Medida borrada', { action: 'Deshacer', onAction: () => restoreMetricEntry(entry) });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry ? `Editar ${type.name.toLowerCase()}` : `Apuntar ${type.name.toLowerCase()}`}
      headerExtra={
        entry ? (
          <button className="icon-btn small" aria-label="Borrar medida" onClick={remove}>
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
      <div className="metric-input">
        <button className="icon-btn" aria-label={`Restar ${fmtFixed(step, type.decimals)}`} onClick={() => bump(-step)} disabled={base === undefined}>
          <Minus size={20} />
        </button>
        <label className="grow">
          <span className="sr-only">
            {type.name} en {type.unit}
          </span>
          <input
            className="input"
            inputMode="decimal"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={last ? toInput(last.value) : '0'}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </label>
        <span className="unit">{type.unit}</span>
        <button className="icon-btn" aria-label={`Sumar ${fmtFixed(step, type.decimals)}`} onClick={() => bump(step)} disabled={base === undefined}>
          <Plus size={20} />
        </button>
      </div>
      {last && !entry && (
        <p className="hint center">
          La última vez: {fmtFixed(last.value, type.decimals)} {type.unit} ({formatRelative(last.date, today).toLowerCase()})
        </p>
      )}
      <div className="field mt16">
        <label htmlFor="me-date">Día</label>
        <input id="me-date" className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </div>
      {clash && (
        <p className="hint">
          Ese día ya tienes {fmtFixed(clash.value, type.decimals)} {type.unit}: se sustituirá.
        </p>
      )}
      <div className="field mt16">
        <label htmlFor="me-note">Nota (opcional)</label>
        <input id="me-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="En ayunas, después de entrenar…" />
      </div>
    </Sheet>
  );
}

function MetricTypeSheet({ type, onClose, onSaved }: { type?: MetricType; onClose: () => void; onSaved: (id: string) => void }) {
  const state = useApp();
  const [name, setName] = useState(type?.name ?? '');
  const [unit, setUnit] = useState(type?.unit ?? '');
  const [decimals, setDecimals] = useState<string>(String(type?.decimals ?? 1));
  const [goal, setGoal] = useState(toInput(type?.goal));
  const count = type ? state.metrics.filter((m) => m.metricId === type.id).length : 0;
  const have = new Set(state.metricTypes.map((t) => fold(t.name)));
  const presets = PRESETS.filter((p) => !have.has(fold(p.name)));
  const valid = !!name.trim() && !!unit.trim();

  const save = () => {
    if (!valid) return;
    const g = parseDecimal(goal);
    const id = saveMetricType({ id: type?.id, name: name.trim(), unit: unit.trim(), decimals: Number(decimals), goal: g !== null && g > 0 ? g : undefined });
    onSaved(id);
    onClose();
  };
  const remove = async () => {
    if (!type) return;
    const ok = await confirmDialog({
      title: `¿Borrar «${type.name}»?`,
      message: count ? `Se borrarán también sus ${count} medidas. No se puede deshacer.` : undefined,
      confirm: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    deleteMetricType(type.id);
    toast('Medida borrada');
    onClose();
  };

  const row = (label: string, children: ReactNode) => (
    <div className="field">
      <span className="label">{label}</span>
      {children}
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={type ? `Ajustes de ${type.name.toLowerCase()}` : 'Nueva medida'}
      headerExtra={
        type ? (
          <button className="icon-btn small" aria-label="Borrar medida" onClick={remove}>
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
      {!type && presets.length > 0 && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {presets.map((p) => (
            <button
              key={p.name}
              className={`chip mini ${fold(name) === fold(p.name) ? 'on' : ''}`}
              onClick={() => {
                setName(p.name);
                setUnit(p.unit);
                setDecimals(String(p.decimals));
              }}
            >
              {p.name} · {p.unit}
            </button>
          ))}
        </div>
      )}
      <div className="two">
        <div className="field">
          <label htmlFor="mt-name">Nombre</label>
          <input id="mt-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cintura" />
        </div>
        <div className="field">
          <label htmlFor="mt-unit">Unidad</label>
          <input id="mt-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cm" />
        </div>
      </div>
      <div className="mt16">
        {row(
          'Decimales',
          <Segmented
            value={decimals}
            onChange={setDecimals}
            options={[
              { value: '0', label: '72' },
              { value: '1', label: '72,4' },
              { value: '2', label: '72,45' },
            ]}
          />,
        )}
      </div>
      <div className="field mt16">
        <label htmlFor="mt-goal">Objetivo (opcional)</label>
        <input id="mt-goal" className="input" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={unit ? `En ${unit}` : ''} />
        <p className="hint">Sale como una línea en la gráfica y te dice cuánto te falta.</p>
      </div>
    </Sheet>
  );
}
