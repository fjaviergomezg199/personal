import { ChevronLeft, ChevronRight, Pencil, Plus, Repeat, Target, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty, toast } from '../components/ui';
import { capitalize, daysBetween, formatShort, todayISO } from '../lib/dates';
import {
  balanceForecast, budgetLines, categoryOf, currentPeriod, daysLeft, eur, eurInt, payDue, periodLabel, periodLast, periodsOf, summarizePeriod,
  withStart, type Occurrence, type Period,
} from '../lib/finance';
import { useToday } from '../lib/useToday';
import { getState, updateFinAccount, useApp } from '../store/store';
import type { Area, FinScope, Movement } from '../store/types';
import { HomeShareSheet } from '../sheets/HomeShareSheet';
import { BudgetsSheet, OccurrenceSheet, PeriodSetup, PeriodSheet, RecurringListSheet, RecurringSheet } from '../sheets/FinanceSheets';
import { MovementSheet } from '../sheets/MovementSheet';
import { ShareStatus } from './ListModule';

const DISMISS_KEY = 'diaadia:payAsked';

function dismissedToday(scope: FinScope, today: string): boolean {
  try {
    return localStorage.getItem(`${DISMISS_KEY}:${scope}`) === today;
  } catch {
    return false;
  }
}

/** Finanzas de una cuenta (la tuya o la conjunta), por periodos de cobro a cobro. */
export function FinanceModule({ area, scope }: { area: Area; scope: FinScope }) {
  const state = useApp();
  const today = useToday();
  const fin = state.finance;
  const acc = fin.accounts[scope];
  const earliest = useMemo(() => {
    let min: string | undefined;
    for (const m of fin.movements) if (m.scope === scope && !m.deleted && (!min || m.date < min)) min = m.date;
    return min;
  }, [fin.movements, scope]);
  const periods = useMemo(() => periodsOf(acc, today, earliest), [acc, today, earliest]);
  const [sel, setSel] = useState<{ base: string; start: string } | null>(null);
  const selIdx = sel && sel.base === today ? periods.findIndex((p) => p.start === sel.start) : -1;
  const idx = selIdx >= 0 ? selIdx : periods.length - 1;
  const period = periods[idx];
  const isCurrent = idx === periods.length - 1;
  const last = periodLast(period);
  const s = useMemo(() => summarizePeriod(fin, scope, period, today), [fin, scope, period, today]);
  const lines = budgetLines(acc, s);
  const forecast = isCurrent ? balanceForecast(acc, fin, scope, period, today) : null;
  const left = daysLeft(period, today);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [asked, setAsked] = useState(() => dismissedToday(scope, today));

  const [movementSheet, setMovementSheet] = useState<{ kind?: 'gasto' | 'ingreso'; movement?: Movement } | null>(null);
  const [budgets, setBudgets] = useState(false);
  const [periodSheet, setPeriodSheet] = useState(false);
  const [fixedList, setFixedList] = useState(false);
  const [newFixed, setNewFixed] = useState(false);
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [editFixed, setEditFixed] = useState<Occurrence['recurring'] | null>(null);
  const [sharing, setSharing] = useState(false);

  const go = (i: number) => {
    setSel({ base: today, start: periods[i].start });
    setCatFilter(null);
  };
  const configured = acc.periodStarts.length > 0;
  const due = isCurrent && payDue(acc, today) && !asked;
  const startToday = () => {
    updateFinAccount(scope, 'periods', { periodStarts: withStart(getState().finance.accounts[scope].periodStarts, today) });
    setSel(null);
    toast('¡Periodo nuevo! Empieza a contar desde hoy');
  };
  const notYet = () => {
    try {
      localStorage.setItem(`${DISMISS_KEY}:${scope}`, today);
    } catch {
      /* nada */
    }
    setAsked(true);
  };

  const movements = catFilter ? s.movements.filter((m) => m.category === catFilter) : s.movements;
  const byDay = useMemo(() => {
    const map = new Map<string, Movement[]>();
    for (const m of movements) map.set(m.date, [...(map.get(m.date) ?? []), m]);
    return [...map];
  }, [movements]);
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.amount));
  const contributions = useMemo(() => {
    if (scope !== 'hogar') return [];
    const by = new Map<string, number>();
    for (const m of s.movements) if (m.kind === 'ingreso') by.set(m.by ?? '—', (by.get(m.by ?? '—') ?? 0) + m.amount);
    return [...by].sort((a, b) => b[1] - a[1]);
  }, [s.movements, scope]);
  const total = acc.budgetTotal;
  const over = total !== undefined && s.spent > total;
  const pastPeriods = isCurrent ? periods.slice(0, -1).slice(-6).reverse() : [];

  return (
    <div>
      {scope === 'hogar' && (
        <div style={{ marginBottom: 12 }}>
          <ShareStatus onSetup={() => setSharing(true)} what="la cuenta conjunta" />
        </div>
      )}

      {!configured && isCurrent && <PeriodSetup scope={scope} />}

      {configured && (
      <div className="card period-nav">
        <button className="icon-btn small plain" aria-label="Periodo anterior" disabled={idx === 0} onClick={() => go(idx - 1)}>
          <ChevronLeft size={20} />
        </button>
        <div className="grow center">
          <div style={{ fontWeight: 750 }}>{isCurrent ? 'Periodo actual' : periodLabel(period, today)}</div>
          <div className="tiny muted">
            {isCurrent
              ? `${periodLabel(period, today)}${period.end ? '' : left > 0 ? ` · quedan ${left} ${left === 1 ? 'día' : 'días'}` : ' · esperando el cobro'}`
              : `${daysBetween(period.start, last) + 1} días`}
          </div>
        </div>
        <button className="icon-btn small plain" aria-label="Cambiar fechas" onClick={() => setPeriodSheet(true)}>
          <Pencil size={15} />
        </button>
        <button className="icon-btn small plain" aria-label="Periodo siguiente" disabled={isCurrent} onClick={() => go(idx + 1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      )}

      {due && (
        <div className="banner tone-green mt12">
          <div className="big">💰</div>
          <div className="grow">
            <div className="t">¿Ya has cobrado?</div>
            <div className="d">Si es así, empieza el periodo nuevo y se cuenta desde hoy.</div>
            <div className="hstack mt8 wrap">
              <button className="btn small" onClick={startToday}>
                Sí, he cobrado hoy
              </button>
              <button className="btn small secondary" onClick={() => setPeriodSheet(true)}>
                Otro día
              </button>
              <button className="link-btn" onClick={notYet}>
                Aún no
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`card tone-${area.color} mt12`}>
        <div className="ms-label">{scope === 'hogar' ? 'Gastado de la cuenta conjunta' : 'Gastado'}</div>
        <div className="ms-hero">
          {eurInt(s.spent)}
          {total !== undefined && <span className="ms-of"> de {eurInt(total)}</span>}
        </div>
        {total !== undefined && (
          <>
            <div className={`meter mt8 ${over ? 'over' : ''}`} role="meter" aria-valuenow={Math.round(s.spent)} aria-valuemax={Math.round(total)} aria-valuemin={0}>
              <div style={{ width: `${Math.min(100, (s.spent / total) * 100)}%` }} />
            </div>
            {isCurrent && (
              <div className="small mt8">
                {over ? (
                  <span className="ms-warn">
                    <TriangleAlert size={14} /> Te pasas {eurInt(s.spent - total)}
                  </span>
                ) : (
                  <span className="muted">
                    Quedan <b>{eurInt(total - s.spent)}</b>
                    {left > 0 && ` · ${left} ${left === 1 ? 'día' : 'días'} · unos ${eurInt((total - s.spent) / left)} al día`}
                  </span>
                )}
              </div>
            )}
          </>
        )}
        <div className="fin-stats">
          <div>
            <span>{scope === 'hogar' ? 'Aportado' : 'Ingresos'}</span>
            <b>{eurInt(s.income)}</b>
          </div>
          {(s.pending > 0 || isCurrent) && (
            <div>
              <span>Fijos por cargar</span>
              <b>{eurInt(s.pending)}</b>
            </div>
          )}
          {(s.income > 0 || s.pendingIncome > 0) && (
            <div>
              <span>{isCurrent ? (scope === 'hogar' ? 'Queda' : 'Te queda') : 'Ahorro'}</span>
              <b>{eurInt(s.income + s.pendingIncome - s.spent - s.pending)}</b>
            </div>
          )}
        </div>
        {contributions.length > 1 && (
          <div className="small muted mt8">
            Aportado: {contributions.map(([who, v]) => `${who} ${eurInt(v)}`).join(' · ')}
          </div>
        )}
        {forecast && (
          <div className="small muted mt8">
            Saldo estimado: hoy <b>{eurInt(forecast.now)}</b> · al cobrar <b>{eurInt(forecast.end)}</b>
          </div>
        )}
      </div>

      <div className="btn-row mt12">
        <button className="btn" onClick={() => setMovementSheet({ kind: 'gasto' })}>
          <Plus size={18} /> Gasto
        </button>
        <button className="btn secondary" onClick={() => setMovementSheet({ kind: 'ingreso' })}>
          <Plus size={18} /> Ingreso
        </button>
      </div>

      {lines.length > 0 ? (
        <div className="section">
          <div className="section-head">
            <h2>Objetivos de gasto</h2>
            <button className="link-btn" onClick={() => setBudgets(true)}>
              Cambiar
            </button>
          </div>
          <div className={`card tone-${area.color}`}>
            {lines.map((l) => {
              const c = categoryOf(l.key);
              const isOver = l.spent > l.limit;
              return (
                <div key={l.key} className="budget-line">
                  <div className="hstack">
                    <span className="grow">
                      {c.emoji} {c.label}
                    </span>
                    <span className="bl-val">
                      {eurInt(l.spent)} <span className="faint">de {eurInt(l.limit)}</span>
                    </span>
                  </div>
                  <div className={`meter ${isOver ? 'over' : ''}`} role="meter" aria-label={c.label} aria-valuenow={Math.round(l.spent)} aria-valuemax={Math.round(l.limit)} aria-valuemin={0}>
                    <div style={{ width: `${Math.min(100, (l.spent / l.limit) * 100)}%` }} />
                  </div>
                  {isOver ? (
                    <div className="bl-note warn">
                      <TriangleAlert size={13} /> Te pasas {eurInt(l.spent - l.limit)}
                    </div>
                  ) : (
                    isCurrent && <div className="bl-note">Quedan {eurInt(l.limit - l.spent)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        isCurrent && (
          <button className="card hstack mt12" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => setBudgets(true)}>
            <Target size={20} color="var(--primary)" />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>Ponte objetivos de gasto</div>
              <div className="small muted">
                {scope === 'hogar'
                  ? 'Súper, casa, ocio juntos… y cuánto queda en cada uno hasta el próximo cobro.'
                  : 'Ocio, restaurantes, compras… y cuánto te queda en cada uno hasta que cobres.'}
              </div>
            </div>
          </button>
        )
      )}

      {s.byCategory.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>En qué se va</h2>
          </div>
          <div className="card cat-bars">
            {s.byCategory.map((c) => {
              const cat = categoryOf(c.key);
              return (
                <button
                  key={c.key}
                  className={`cat-bar ${catFilter === c.key ? 'on' : ''} tone-${area.color}`}
                  onClick={() => setCatFilter(catFilter === c.key ? null : c.key)}
                  aria-pressed={catFilter === c.key}
                >
                  <span className="cb-label">
                    {cat.emoji} {cat.label}
                  </span>
                  <span className="cb-track">
                    <span className="cb-fill" style={{ width: `${Math.max(2, (c.amount / maxCat) * 100)}%` }} />
                  </span>
                  <span className="cb-val">{eurInt(c.amount)}</span>
                </button>
              );
            })}
            <p className="hint" style={{ margin: '6px 0 0' }}>
              Toca una categoría para ver solo sus movimientos.
            </p>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h2>Fijos</h2>
          <div className="hstack">
            <button className="link-btn" onClick={() => setFixedList(true)}>
              Todos
            </button>
            <button className="link-btn" onClick={() => setNewFixed(true)}>
              Añadir
            </button>
          </div>
        </div>
        {s.occurrences.length ? (
          <div className="list">
            {s.occurrences.map((o) => (
              <button key={`${o.recurring.id}-${o.month}`} className="row tappable no-lead" onClick={() => setOccurrence(o)}>
                <div className="body">
                  <div className="title">
                    {categoryOf(o.recurring.category).emoji} {o.recurring.name}
                  </div>
                  <div className="meta">
                    <span>{capitalize(formatShort(o.date))}</span>
                    <span className={o.charged ? 'ok' : 'faint'}>{o.charged ? (o.recurring.kind === 'gasto' ? '✓ Cargado' : '✓ Cobrado') : 'Pendiente'}</span>
                  </div>
                </div>
                <div className={`mv-amount ${o.recurring.kind}`}>
                  {o.recurring.kind === 'ingreso' ? '+' : ''}
                  {eur(o.amount)}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <button className="card hstack" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => setNewFixed(true)}>
            <Repeat size={20} color="var(--primary)" />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{scope === 'hogar' ? 'Hipoteca, luz, comunidad…' : 'Gimnasio, móvil, suscripciones…'}</div>
              <div className="small muted">Apunta los fijos una vez y cada periodo cuentan solos, con lo que falta por cargar.</div>
            </div>
          </button>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Movimientos</h2>
          {catFilter && (
            <button className="chip mini on" onClick={() => setCatFilter(null)}>
              {categoryOf(catFilter).emoji} {categoryOf(catFilter).label} <X size={13} />
            </button>
          )}
        </div>
        {byDay.length ? (
          byDay.map(([day, list]) => (
            <div key={day} style={{ marginBottom: 10 }}>
              <div className="day-head" style={{ margin: '4px 4px 6px' }}>
                {day === today ? 'Hoy' : capitalize(formatShort(day))}
              </div>
              <div className="list">
                {list.map((m) => {
                  const c = categoryOf(m.category);
                  return (
                    <button key={m.id} className="row tappable no-lead" onClick={() => setMovementSheet({ movement: m })}>
                      <span className="mv-emoji" aria-hidden>
                        {c.emoji}
                      </span>
                      <div className="body">
                        <div className="title">{m.note || c.label}</div>
                        <div className="meta">
                          {m.note && <span>{c.label}</span>}
                          {scope === 'hogar' && m.by && <span>{m.by}</span>}
                        </div>
                      </div>
                      <div className={`mv-amount ${m.kind}`}>
                        {m.kind === 'ingreso' ? '+' : '−'}
                        {eur(m.amount)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="card">
            <Empty
              emoji={scope === 'hogar' ? '🤝' : '💶'}
              title={catFilter ? 'Nada en esta categoría' : isCurrent ? 'Aún no hay movimientos en este periodo' : 'Sin movimientos'}
              text={isCurrent && !catFilter ? 'Apunta cada gasto en un momento: importe, y listo (la categoría la adivino por el concepto).' : undefined}
            />
          </div>
        )}
      </div>

      {pastPeriods.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Periodos anteriores</h2>
          </div>
          <div className="list">
            {pastPeriods.map((p) => (
              <PastPeriodRow key={p.start} scope={scope} period={p} total={total} onOpen={() => go(periods.indexOf(p))} />
            ))}
          </div>
        </div>
      )}

      <div className="hstack mt16" style={{ justifyContent: 'space-between' }}>
        <button className="link-btn" onClick={() => setBudgets(true)}>
          Objetivos y día de cobro
        </button>
        <button className="link-btn" onClick={() => setFixedList(true)}>
          Fijos
        </button>
      </div>
      {scope === 'personal' && <p className="hint mt8">«Mis finanzas» solo se guarda en este móvil.</p>}

      {movementSheet && <MovementSheet scope={scope} kind={movementSheet.kind} movement={movementSheet.movement} onClose={() => setMovementSheet(null)} />}
      {budgets && <BudgetsSheet scope={scope} onClose={() => setBudgets(false)} />}
      {periodSheet && <PeriodSheet scope={scope} period={period} isCurrent={isCurrent} onClose={() => setPeriodSheet(false)} />}
      {fixedList && <RecurringListSheet scope={scope} onClose={() => setFixedList(false)} />}
      {newFixed && <RecurringSheet scope={scope} onClose={() => setNewFixed(false)} />}
      {occurrence && (
        <OccurrenceSheet
          occurrence={occurrence}
          onClose={() => setOccurrence(null)}
          onEdit={() => {
            setEditFixed(occurrence.recurring);
            setOccurrence(null);
          }}
        />
      )}
      {editFixed && <RecurringSheet scope={scope} recurring={editFixed} onClose={() => setEditFixed(null)} />}
      {sharing && <HomeShareSheet onClose={() => setSharing(false)} />}
    </div>
  );
}

function PastPeriodRow({ scope, period, total, onOpen }: { scope: FinScope; period: Period; total?: number; onOpen: () => void }) {
  const state = useApp();
  const today = todayISO();
  const s = useMemo(() => summarizePeriod(state.finance, scope, period, today), [state.finance, scope, period, today]);
  return (
    <button className="row tappable no-lead" onClick={onOpen}>
      <div className="body">
        <div className="title">{periodLabel(period, today)}</div>
        {total !== undefined && (
          <div className={`meter mt8 ${s.spent > total ? 'over' : ''}`} style={{ maxWidth: 200 }}>
            <div style={{ width: `${Math.min(100, (s.spent / total) * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="mv-amount gasto">
        {eurInt(s.spent)}
        {total !== undefined && s.spent > total && <TriangleAlert size={13} style={{ marginLeft: 4, verticalAlign: -1, color: 'var(--warning)' }} aria-label="Por encima del objetivo" />}
      </div>
    </button>
  );
}

/** Resumen para la pantalla Hoy. */
export function useFinanceSummary(scope: FinScope) {
  const state = useApp();
  const today = useToday();
  const acc = state.finance.accounts[scope];
  const period = currentPeriod(acc, today);
  const s = summarizePeriod(state.finance, scope, period, today);
  return { acc, period, summary: s, left: daysLeft(period, today), due: payDue(acc, today) };
}
