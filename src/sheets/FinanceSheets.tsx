import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { confirmDialog, Empty, Segmented, Sheet, toast } from '../components/ui';
import { addDays, capitalize, formatDayMonth, MONTHS, parseISODate, todayISO } from '../lib/dates';
import {
  categoriesFor, categoryOf, currentPeriod, dayOfMonth, eur, moveStart, parseAmount, periodLast, setEnd, withStart, type Occurrence, type Period,
} from '../lib/finance';
import {
  addMovement, deleteMovement, deleteRecurring, saveRecurring, setRecurringSkip, updateFinAccount, updateMovement, useApp,
} from '../store/store';
import type { Cadence, FinKind, FinScope, Recurring } from '../store/types';

const amountText = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

/* ---------- Primera vez: ¿cuándo empieza tu mes? ---------- */

/** Último día de cobro hasta hoy (para proponer el inicio del periodo). */
export function lastPayday(day: number, today: string): string {
  const d = parseISODate(today);
  const thisMonth = dayOfMonth(d.getFullYear(), d.getMonth(), day);
  return thisMonth <= today ? thisMonth : dayOfMonth(d.getFullYear(), d.getMonth() - 1, day);
}

export function PeriodSetup({ scope }: { scope: FinScope }) {
  const today = todayISO();
  const [day, setDay] = useState<number>(25);
  const [other, setOther] = useState('');
  const [start, setStart] = useState(() => lastPayday(25, today));
  const pick = (d: number) => {
    setDay(d);
    setStart(lastPayday(d, today));
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 'calc(17px * var(--fs))' }}>{scope === 'hogar' ? '¿Cuándo empieza el mes en la cuenta conjunta?' : '¿Cuándo empieza tu mes?'}</div>
      <p className="small muted" style={{ margin: '4px 0 12px' }}>
        {scope === 'hogar'
          ? 'Aquí el mes va de un cobro al siguiente (cuando entran las nóminas o las aportaciones), no del 1 al 30.'
          : 'Aquí el mes va de un cobro al siguiente, no del 1 al 30. Si un mes cobras el 25 y otro el 27, no pasa nada: tú dices cuándo empieza.'}
      </p>
      <span className="label">Día en que se suele cobrar</span>
      <div className="chips mt8">
        {[1, 25, 26, 27, 28, 30].map((d) => (
          <button key={d} className={`chip mini ${day === d && !other ? 'on' : ''}`} onClick={() => (setOther(''), pick(d))}>
            Día {d}
          </button>
        ))}
        <input
          className="input"
          style={{ width: 90, minHeight: 32, padding: '4px 10px' }}
          inputMode="numeric"
          placeholder="Otro"
          value={other}
          onChange={(e) => {
            setOther(e.target.value);
            const n = Number(e.target.value);
            if (n >= 1 && n <= 31) pick(n);
          }}
          aria-label="Otro día"
        />
      </div>
      <div className="field mt12">
        <label htmlFor={`ps-${scope}`}>Este periodo empezó el</label>
        <input id={`ps-${scope}`} className="input" type="date" value={start} max={today} onChange={(e) => e.target.value && setStart(e.target.value)} />
      </div>
      <button
        className="btn block mt12"
        onClick={() => {
          updateFinAccount(scope, 'periods', { payday: day, periodStarts: [start] });
          toast('Listo: el periodo empieza cada vez que cobres');
        }}
      >
        Empezar
      </button>
    </div>
  );
}

/* ---------- Objetivos de gasto y día de cobro ---------- */

export function BudgetsSheet({ scope, onClose }: { scope: FinScope; onClose: () => void }) {
  const state = useApp();
  const acc = state.finance.accounts[scope];
  const [payday, setPayday] = useState(acc.payday ? String(acc.payday) : '');
  const [total, setTotal] = useState(amountText(acc.budgetTotal));
  const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(acc.budgets).map(([k, v]) => [k, amountText(v)])));
  const cats = categoriesFor('gasto');

  const save = () => {
    const budgets: Record<string, number> = {};
    for (const [k, v] of Object.entries(limits)) {
      const n = parseAmount(v);
      if (n && n > 0) budgets[k] = n;
    }
    const t = parseAmount(total);
    updateFinAccount(scope, 'budgets', { budgets, budgetTotal: t && t > 0 ? t : undefined });
    const d = Number(payday);
    const nextPayday = d >= 1 && d <= 31 ? d : undefined;
    if (nextPayday !== acc.payday) updateFinAccount(scope, 'periods', { payday: nextPayday });
    toast('Objetivos guardados');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title="Objetivos de gasto"
      footer={
        <button className="btn block" onClick={save}>
          Guardar
        </button>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Cuánto quieres gastar como mucho en cada periodo (de cobro a cobro). Deja en blanco lo que no quieras controlar.
      </p>
      <div className="two">
        <div className="field">
          <label htmlFor="bg-total">Total del periodo</label>
          <input id="bg-total" className="input" inputMode="decimal" placeholder="Sin límite" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="bg-pay">Día de cobro</label>
          <input id="bg-pay" className="input" inputMode="numeric" placeholder="Sin día fijo" value={payday} onChange={(e) => setPayday(e.target.value)} />
        </div>
      </div>
      <p className="hint">Ese día te preguntaré si ya has cobrado para empezar el periodo nuevo.</p>
      <div className="label mt16">Por categoría</div>
      <div className="list flat mt8">
        {cats.map((c) => (
          <label key={c.key} className="row no-lead budget-row">
            <span className="body">
              <span className="title">
                {c.emoji} {c.label}
              </span>
            </span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="—"
              value={limits[c.key] ?? ''}
              onChange={(e) => setLimits((l) => ({ ...l, [c.key]: e.target.value }))}
              aria-label={`Límite de ${c.label}`}
            />
            <span className="faint">€</span>
          </label>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------- Fechas de un periodo ---------- */

export function PeriodSheet({ scope, period, isCurrent, onClose }: { scope: FinScope; period: Period; isCurrent: boolean; onClose: () => void }) {
  const state = useApp();
  const today = todayISO();
  const acc = state.finance.accounts[scope];
  const [start, setStart] = useState(period.start);
  const [open, setOpen] = useState(isCurrent && !period.end);
  const [end, setEndDate] = useState(period.end ?? (isCurrent ? today : periodLast(period)));
  const [error, setError] = useState('');

  const save = () => {
    let starts: string[] | null = period.virtual ? withStart(acc.periodStarts, start) : moveStart(acc.periodStarts, period.start, start);
    if (starts && (!open || period.end)) starts = setEnd(starts, start, open ? undefined : end);
    if (!starts || (!open && end < start)) {
      setError('Esas fechas se cruzan con otro periodo.');
      return;
    }
    updateFinAccount(scope, 'periods', { periodStarts: starts });
    toast('Fechas cambiadas');
    onClose();
  };

  const startNew = () => {
    updateFinAccount(scope, 'periods', { periodStarts: withStart(acc.periodStarts, today) });
    toast('Periodo nuevo desde hoy');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Fechas del periodo"
      footer={
        <button className="btn block" onClick={save}>
          Guardar
        </button>
      }
    >
      <div className="field">
        <label htmlFor="pd-start">Empieza el</label>
        <input id="pd-start" className="input" type="date" value={start} max={today} onChange={(e) => (setStart(e.target.value), setError(''))} />
      </div>
      {isCurrent && (
        <label className="switch-row">
          <div className="grow">
            <div className="t">Sigue abierto hasta que cobre</div>
            <div className="d">Lo normal: cuando cobres, empiezas el siguiente.</div>
          </div>
          <span className="switch">
            <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
            <span />
          </span>
        </label>
      )}
      {!open && (
        <div className="field mt12">
          <label htmlFor="pd-end">Termina el</label>
          <input id="pd-end" className="input" type="date" value={end} min={start} onChange={(e) => (setEndDate(e.target.value), setError(''))} />
          <p className="hint">El siguiente periodo empieza al día siguiente.</p>
        </div>
      )}
      {error && <p className="hint" style={{ color: 'var(--danger)' }}>{error}</p>}
      {isCurrent && period.start < today && (
        <>
          <div className="divider" />
          <button className="btn secondary block" onClick={startNew}>
            He cobrado hoy: empezar periodo nuevo
          </button>
        </>
      )}
    </Sheet>
  );
}

/* ---------- Fijos ---------- */

const CADENCE_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'Mes' },
  { value: '2', label: '2 meses' },
  { value: '3', label: '3 meses' },
  { value: '6', label: '6 meses' },
  { value: '12', label: 'Año' },
];

const PRESETS: { name: string; category: string; kind?: FinKind; every?: Cadence; day?: number }[] = [
  { name: 'Hipoteca', category: 'hipoteca', day: 1 },
  { name: 'Alquiler', category: 'hipoteca', day: 1 },
  { name: 'Luz', category: 'facturas' },
  { name: 'Agua', category: 'facturas', every: 2 },
  { name: 'Gas', category: 'facturas', every: 2 },
  { name: 'Internet y móvil', category: 'facturas' },
  { name: 'Comunidad', category: 'casa' },
  { name: 'Seguro de hogar', category: 'seguros', every: 12 },
  { name: 'Seguro del coche', category: 'seguros', every: 12 },
  { name: 'IBI', category: 'impuestos', every: 12 },
  { name: 'Gimnasio', category: 'deporte' },
  { name: 'Netflix', category: 'suscripciones' },
  { name: 'Spotify', category: 'suscripciones' },
  { name: 'Nómina', category: 'nomina', kind: 'ingreso', day: 25 },
  { name: 'Aportación', category: 'aportacion', kind: 'ingreso' },
];

/** Los próximos 12 meses ('AAAA-MM'), para elegir cuándo toca un fijo que no es mensual. */
function nextMonths(today: string): string[] {
  const d = parseISODate(today);
  return Array.from({ length: 12 }, (_, k) => dayOfMonth(d.getFullYear(), d.getMonth() + k, 1).slice(0, 7));
}

export function RecurringSheet({ scope, recurring, onClose }: { scope: FinScope; recurring?: Recurring; onClose: () => void }) {
  const state = useApp();
  const today = todayISO();
  const [kind, setKind] = useState<FinKind>(recurring?.kind ?? 'gasto');
  const [name, setName] = useState(recurring?.name ?? '');
  const [amount, setAmount] = useState(amountText(recurring?.amount));
  const [day, setDay] = useState(String(recurring?.day ?? 1));
  const [every, setEvery] = useState(String(recurring?.every ?? 1));
  const [nextMonth, setNextMonth] = useState(() => (recurring && recurring.from > today ? recurring.from.slice(0, 7) : today.slice(0, 7)));
  const [category, setCategory] = useState(recurring?.category ?? 'facturas');
  const [where, setWhere] = useState<FinScope>(recurring?.scope ?? scope);
  const value = parseAmount(amount);
  const d = Number(day);
  const valid = !!name.trim() && value !== null && value > 0 && d >= 1 && d <= 31;

  const save = () => {
    if (!valid) return;
    const cadence = Number(every) as Cadence;
    const acc = state.finance.accounts[where];
    // Mensual: cuenta desde el periodo actual. Si no, desde el mes del próximo cargo (que marca el ritmo).
    const from = cadence === 1 ? (recurring?.from ?? currentPeriod(acc, today).start) : `${nextMonth}-01`;
    saveRecurring({
      id: recurring?.id,
      scope: where,
      kind,
      name: name.trim(),
      amount: value!,
      category,
      day: d,
      every: cadence,
      from,
      skips: recurring?.skips,
      active: true,
    });
    toast(recurring ? 'Fijo guardado' : `${name.trim()}: cada ${cadence === 1 ? 'mes' : cadence === 12 ? 'año' : `${cadence} meses`}, el día ${d}`);
    onClose();
  };

  const remove = async () => {
    if (!recurring) return;
    const ok = await confirmDialog({ title: `¿Borrar «${recurring.name}»?`, message: 'Deja de contar en los periodos. Lo que ya apuntaste de él se queda.', confirm: 'Borrar', danger: true });
    if (!ok) return;
    deleteRecurring(recurring.id);
    toast('Fijo borrado');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title={recurring ? 'Editar fijo' : 'Nuevo fijo'}
      headerExtra={
        recurring ? (
          <button className="icon-btn small" aria-label="Borrar fijo" onClick={remove}>
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
      {!recurring && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className={`chip mini ${name === p.name ? 'on' : ''}`}
              onClick={() => {
                setName(p.name);
                setCategory(p.category);
                setKind(p.kind ?? 'gasto');
                setEvery(String(p.every ?? 1));
                if (p.day) setDay(String(p.day));
              }}
            >
              {categoryOf(p.category).emoji} {p.name}
            </button>
          ))}
        </div>
      )}
      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k);
          if (categoryOf(category).kind !== k) setCategory(k === 'gasto' ? 'facturas' : 'nomina');
        }}
        options={[
          { value: 'gasto', label: 'Gasto fijo' },
          { value: 'ingreso', label: 'Ingreso fijo' },
        ]}
      />
      <div className="two mt16">
        <div className="field">
          <label htmlFor="rc-name">Nombre</label>
          <input id="rc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hipoteca" />
        </div>
        <div className="field">
          <label htmlFor="rc-amount">Importe (€)</label>
          <input id="rc-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="750" />
        </div>
      </div>
      <p className="hint">Si cambia cada vez (la luz), pon lo normal: cada mes puedes poner lo que llegó de verdad.</p>
      <div className="two mt12">
        <div className="field">
          <label htmlFor="rc-day">Día del mes</label>
          <input id="rc-day" className="input" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div />
      </div>
      <div className="field mt12">
        <span className="label">Cada</span>
        <div className="seg-compact">
          <Segmented value={every} onChange={setEvery} options={CADENCE_OPTIONS} />
        </div>
      </div>
      {every !== '1' && (
        <div className="field mt12">
          <label htmlFor="rc-next">Próximo cargo en</label>
          <select id="rc-next" className="select" value={nextMonth} onChange={(e) => setNextMonth(e.target.value)}>
            {nextMonths(today).map((m) => (
              <option key={m} value={m}>
                {capitalize(MONTHS[Number(m.slice(5, 7)) - 1])} {m.slice(0, 4)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field mt16">
        <span className="label">Categoría</span>
        <div className="cat-grid">
          {categoriesFor(kind).map((c) => (
            <button key={c.key} className={`cat-chip ${category === c.key ? 'on' : ''}`} onClick={() => setCategory(c.key)} aria-pressed={category === c.key}>
              <span className="e" aria-hidden>
                {c.emoji}
              </span>
              <span className="l">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field mt16">
        <span className="label">Cuenta</span>
        <Segmented
          value={where}
          onChange={setWhere}
          options={[
            { value: 'personal', label: '💶 Mía' },
            { value: 'hogar', label: '🤝 Conjunta' },
          ]}
        />
      </div>
    </Sheet>
  );
}

export function RecurringListSheet({ scope, onClose }: { scope: FinScope; onClose: () => void }) {
  const state = useApp();
  const [editing, setEditing] = useState<{ recurring?: Recurring } | null>(null);
  const list = state.finance.recurring.filter((r) => r.scope === scope && !r.deleted).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'es'));
  const monthly = list.reduce((t, r) => t + (r.kind === 'gasto' ? r.amount / r.every : 0), 0);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Gastos e ingresos fijos"
      footer={
        <button className="btn block secondary" onClick={() => setEditing({})}>
          <Plus size={18} /> Nuevo fijo
        </button>
      }
    >
      {list.length ? (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            De media, unos <b>{eur(monthly, true)}</b> de gastos fijos al mes.
          </p>
          <div className="list flat">
            {list.map((r) => (
              <button key={r.id} className="row tappable no-lead" onClick={() => setEditing({ recurring: r })}>
                <div className="body">
                  <div className="title">
                    {categoryOf(r.category).emoji} {r.name}
                  </div>
                  <div className="meta">
                    <span>
                      Día {r.day} · {r.every === 1 ? 'cada mes' : r.every === 12 ? 'cada año' : `cada ${r.every} meses`}
                    </span>
                  </div>
                </div>
                <div className={`mv-amount ${r.kind}`}>{eur(r.amount)}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <Empty emoji="📆" title="Sin fijos todavía" text="La hipoteca, la luz, el gimnasio… Apúntalos una vez y cada periodo cuentan solos." />
      )}
      {editing && <RecurringSheet scope={scope} recurring={editing.recurring} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}

/** Un cargo de un fijo en un periodo: poner lo que llegó de verdad, o que este mes no hay. */
export function OccurrenceSheet({ occurrence, onClose, onEdit }: { occurrence: Occurrence; onClose: () => void; onEdit: () => void }) {
  const { recurring: r, movement } = occurrence;
  const today = todayISO();
  const [amount, setAmount] = useState(amountText(occurrence.amount));
  const value = parseAmount(amount);

  const save = () => {
    if (value === null || value <= 0) return;
    if (movement) updateMovement(movement.id, { amount: value });
    else addMovement({ scope: r.scope, kind: r.kind, date: occurrence.date, amount: value, category: r.category, note: r.name, recurringId: r.id });
    toast(`${r.name}: ${eur(value)}`);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${r.name} · ${formatDayMonth(occurrence.date, today)}`}
      footer={
        <button className="btn block" disabled={value === null || value <= 0} onClick={save}>
          Guardar importe de este mes
        </button>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        {movement ? `Apuntado: ${eur(movement.amount)} (lo normal son ${eur(r.amount)}).` : `Lo normal son ${eur(r.amount)}. Si este mes ha sido otra cantidad, ponla aquí.`}
      </p>
      <label className="amount-input">
        <span className="sr-only">Importe</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <span>€</span>
      </label>
      <div className="stack mt16">
        {movement && (
          <button
            className="btn secondary block"
            onClick={() => {
              deleteMovement(movement.id);
              toast('Vuelve al importe de siempre');
              onClose();
            }}
          >
            Volver a {eur(r.amount)}
          </button>
        )}
        <button
          className="btn secondary block"
          onClick={() => {
            setRecurringSkip(r.id, occurrence.month, true);
            if (movement) deleteMovement(movement.id);
            toast(`${r.name}: este mes no cuenta`, { action: 'Deshacer', onAction: () => setRecurringSkip(r.id, occurrence.month, false) });
            onClose();
          }}
        >
          Este mes no se carga
        </button>
        <button className="btn ghost block" onClick={onEdit}>
          Cambiar el fijo (importe, día…)
        </button>
      </div>
      {occurrence.date > today && <p className="hint center">Aún no ha llegado el día: cuenta como pendiente.</p>}
      {occurrence.date < addDays(today, -40) && <p className="hint center">Es de un periodo pasado.</p>}
    </Sheet>
  );
}
