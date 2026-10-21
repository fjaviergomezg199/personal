import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { AgendaRow } from '../components/AgendaRow';
import { Empty, SectionHead } from '../components/ui';
import { addDays, capitalize, formatRelative, formatShort, formatWeek, isISODate, startOfWeek, WEEKDAY_LETTERS } from '../lib/dates';
import { categoryOf, eur, eurInt } from '../lib/finance';
import { formatKg } from '../lib/lifts';
import { navigate, useRoute } from '../lib/router';
import { useToday } from '../lib/useToday';
import { habitRate, hasContent, summaryWeekFor, weekSummary, type WeekSummary } from '../lib/weekSummary';
import { updateSettings, useApp } from '../store/store';

const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const pct = (r: number) => `${Math.round(r * 100)} %`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** «Has hecho 4 cosas, has tenido 1 plan y has cumplido el 86 % de tus hábitos.» */
function headline(w: WeekSummary): string {
  const parts: string[] = [];
  if (w.done.length) parts.push(`has hecho ${plural(w.done.length, 'cosa', 'cosas')}`);
  if (w.plans.length) parts.push(`has tenido ${plural(w.plans.length, 'plan', 'planes')}`);
  const sessions = w.sessions.reduce((n, s) => n + s.done, 0);
  if (sessions) parts.push(`has completado ${plural(sessions, 'sesión', 'sesiones')} de tus áreas`);
  const rate = habitRate(w);
  if (rate) parts.push(`has cumplido el ${pct(rate)} de tus hábitos`);
  else if (rate === 0) parts.push('no has marcado ningún hábito');
  if (!parts.length) return 'Una semana tranquila.';
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
  return `${capitalize(text)}.`;
}

function tiles(w: WeekSummary): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (w.done.length) out.push({ label: 'Hechas', value: String(w.done.length) });
  if (w.plans.length) out.push({ label: 'Planes', value: String(w.plans.length) });
  const total = w.sessions.reduce((n, s) => n + s.total, 0);
  if (total) out.push({ label: 'Sesiones', value: `${w.sessions.reduce((n, s) => n + s.done, 0)}/${total}` });
  const rate = habitRate(w);
  if (rate !== null) out.push({ label: 'Hábitos', value: pct(rate) });
  const mine = w.money.find((m) => m.scope === 'personal');
  if (mine) out.push({ label: 'Gastado', value: eurInt(mine.spent) });
  return out.slice(0, 4);
}

/** Cambio frente a la semana anterior, en texto (no solo color). */
function vsPrev(spent: number, prev: number, complete: boolean): string {
  if (!prev) return '';
  if (!complete) return `La semana anterior: ${eurInt(prev)}`;
  const d = Math.round(((spent - prev) / prev) * 100);
  if (d === 0) return 'Igual que la semana anterior';
  return `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} % ${d > 0 ? 'más' : 'menos'} que la semana anterior (${eurInt(prev)})`;
}

/** Tarjeta de Hoy: el domingo y el lunes. */
export function WeekCard({ today }: { today: string }) {
  const state = useApp();
  const start = summaryWeekFor(today);
  const w = useMemo(() => (start ? weekSummary(state, start, today) : null), [state, start, today]);
  if (!start || !w || state.settings.weekCardClosed === start || !hasContent(w)) return null;
  const t = tiles(w);
  const mine = w.money.find((m) => m.scope === 'personal');
  return (
    <div className="section">
      <SectionHead
        title={start === startOfWeek(today) ? '📊 Tu semana' : '📊 Tu semana pasada'}
        action={
          <button className="icon-btn small plain" aria-label="Cerrar el resumen hasta la semana que viene" onClick={() => updateSettings({ weekCardClosed: start })}>
            <X size={17} />
          </button>
        }
      />
      <div className="card" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => navigate(`/semana?desde=${start}`)}>
        <div className="tiny muted">{formatWeek(start)}</div>
        <div style={{ fontWeight: 650, marginTop: 2 }}>{headline(w)}</div>
        {t.length > 0 && (
          <div className="fin-stats week-tiles">
            {t.map((x) => (
              <div key={x.label}>
                <span>{x.label}</span>
                <b>{x.value}</b>
              </div>
            ))}
          </div>
        )}
        {mine && vsPrev(mine.spent, mine.prev, w.until === w.end) && <div className="small muted mt8">💶 {vsPrev(mine.spent, mine.prev, w.until === w.end)}</div>}
        {w.weight && (
          <div className="small muted mt8">
            ⚖️ {w.weight.name}: {nf1.format(w.weight.value)} {w.weight.unit}
            {w.weight.delta !== undefined && Math.abs(w.weight.delta) >= 0.05 ? ` (${w.weight.delta > 0 ? '+' : '−'}${nf1.format(Math.abs(w.weight.delta))})` : ''}
          </div>
        )}
        <div className="link-btn mt8" style={{ padding: 0 }}>
          Ver el resumen ›
        </div>
      </div>
    </div>
  );
}

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="section">
      <SectionHead title={title} count={count} />
      {children}
    </div>
  );
}

/** Pantalla del resumen, con flechas para ir de semana en semana. */
export function Week() {
  const state = useApp();
  const today = useToday();
  const route = useRoute();
  const thisWeek = startOfWeek(today);
  const q = route.query.get('desde');
  const start = q && isISODate(q) && startOfWeek(q) <= thisWeek ? startOfWeek(q) : (summaryWeekFor(today) ?? thisWeek);
  const w = useMemo(() => weekSummary(state, start, today), [state, start, today]);
  const go = (weeks: number) => navigate(`/semana?desde=${addDays(start, weeks * 7)}`, { replace: true });
  const complete = w.until === w.end;
  const t = tiles(w);
  const shared = !!state.share;

  return (
    <div className="screen">
      <button className="back-link" onClick={() => history.back()}>
        <ChevronLeft size={22} /> Volver
      </button>
      <div className="screen-header">
        <div>
          <h1>Tu semana</h1>
          <div className="sub">{start === thisWeek ? (complete ? 'Esta semana' : 'Esta semana, hasta hoy') : start === addDays(thisWeek, -7) ? 'La semana pasada' : `Del ${formatShort(start)}`}</div>
        </div>
      </div>

      <div className="card period-nav">
        <button className="icon-btn small plain" aria-label="Semana anterior" onClick={() => go(-1)}>
          <ChevronLeft size={20} />
        </button>
        <div className="grow center" style={{ fontWeight: 750 }}>
          {formatWeek(start)}
        </div>
        <button className="icon-btn small plain" aria-label="Semana siguiente" disabled={start >= thisWeek} onClick={() => go(1)}>
          <ChevronRight size={20} />
        </button>
      </div>

      {!hasContent(w) ? (
        <div className="card mt16">
          <Empty emoji="🌱" title="Nada apuntado esta semana" text="Cuando marques tareas, hábitos, entrenos o gastos, aquí verás cómo te ha ido." />
        </div>
      ) : (
        <div className="card mt12">
          <div style={{ fontWeight: 700, fontSize: 'calc(17px * var(--fs))' }}>{headline(w)}</div>
          {t.length > 0 && (
            <div className="fin-stats week-tiles">
              {t.map((x) => (
                <div key={x.label}>
                  <span>{x.label}</span>
                  <b>{x.value}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {w.done.length > 0 && (
        <Block title="✅ Lo que has hecho" count={w.done.length}>
          <div className="list">
            {w.done.slice(0, 12).map((d) => (
              <div key={d.key} className="row no-lead">
                <div className="body">
                  <div className="title">{d.title}</div>
                </div>
                <div className="trail tiny">{capitalize(formatRelative(d.date, today))}</div>
              </div>
            ))}
          </div>
          {w.done.length > 12 && <p className="small muted mt8">Y {plural(w.done.length - 12, 'cosa', 'cosas')} más.</p>}
        </Block>
      )}

      {w.plans.length > 0 && (
        <Block title="📅 Planes" count={w.plans.length}>
          <div className="list">
            {w.plans.map((p) => (
              <div key={p.key} className="row no-lead">
                <div className="body">
                  <div className="title">
                    {p.title}
                    {p.shared && shared ? ' 👥' : ''}
                  </div>
                </div>
                <div className="trail tiny">{capitalize(formatRelative(p.date, today))}</div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {w.sessions.length > 0 && (
        <Block title="🏃 Sesiones de tus áreas">
          <div className="card">
            {w.sessions.map((s) => (
              <div key={s.area.id} className={`budget-line tone-${s.area.color}`}>
                <div className="hstack">
                  <span className="grow">
                    {s.area.emoji} {s.area.name}
                  </span>
                  <b>
                    {s.done} de {s.total}
                  </b>
                </div>
                <div className="meter" role="img" aria-label={`${s.done} de ${s.total} hechas`}>
                  <div style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {w.habits.some((h) => h.due) && (
        <Block title="✅ Hábitos">
          <div className="card">
            <div className="week-habits">
              <span />
              {WEEKDAY_LETTERS.map((l) => (
                <span key={l} className="wh-day">
                  {l}
                </span>
              ))}
              <span />
              {w.habits.map(({ habit: h, days, done, due }) => (
                <div key={h.id} className={`wh-row tone-${h.color}`}>
                  <span className="wh-name">
                    {h.emoji} {h.name}
                  </span>
                  {days.map((m, i) => (
                    <i key={i} className={`hh-cell ${m}`} title={`${WEEKDAY_LETTERS[i]}: ${{ done: 'hecho', part: 'a medias', miss: 'no', off: 'no tocaba', future: '' }[m]}`} />
                  ))}
                  <b className="wh-count">{due ? `${done}/${due}` : '—'}</b>
                </div>
              ))}
            </div>
            <div className="hh-legend mt12" aria-hidden>
              <span>
                <i className="hh-cell done" /> Hecho
              </span>
              {w.habits.some((h) => h.days.includes('part')) && (
                <span>
                  <i className="hh-cell part" /> A medias
                </span>
              )}
              <span>
                <i className="hh-cell miss" /> No
              </span>
              <span>
                <i className="hh-cell off" /> No tocaba
              </span>
            </div>
          </div>
        </Block>
      )}

      {w.money.length > 0 && (
        <Block title="💶 Gastos">
          <div className="card">
            {w.money.map((m, i) => (
              <div key={m.scope} className={i ? 'mt16' : ''}>
                <div className="hstack">
                  <span className="grow" style={{ fontWeight: 650 }}>
                    {m.scope === 'personal' ? 'Tus gastos' : 'Cuenta conjunta'}
                  </span>
                  <b style={{ fontSize: 'calc(19px * var(--fs))' }}>{eur(m.spent)}</b>
                </div>
                {vsPrev(m.spent, m.prev, complete) && <div className="small muted">{vsPrev(m.spent, m.prev, complete)}</div>}
                {m.top.length > 0 && (
                  <div className="small mt8">
                    {m.top.map((c) => (
                      <div key={c.key} className="hstack" style={{ padding: '2px 0' }}>
                        <span className="grow">
                          {categoryOf(c.key).emoji} {categoryOf(c.key).label}
                        </span>
                        <span>{eur(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Block>
      )}

      {(w.weight || w.kcal) && (
        <Block title="⚖️ Cuerpo y comida">
          <div className="card">
            <div className="stat-row" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
              {w.weight && (
                <div className="stat">
                  <div className="stat-label">{w.weight.name}</div>
                  <div className="stat-value">
                    {formatKg(Math.round(w.weight.value * 10 ** w.weight.decimals) / 10 ** w.weight.decimals)} {w.weight.unit}
                  </div>
                  {w.weight.delta !== undefined && (
                    <div className="tiny muted">
                      {Math.abs(w.weight.delta) < 0.05 ? 'Igual que antes' : `${w.weight.delta > 0 ? '▲ +' : '▼ −'}${nf1.format(Math.abs(w.weight.delta))} ${w.weight.unit} desde la anterior`}
                    </div>
                  )}
                </div>
              )}
              {w.kcal && (
                <div className="stat">
                  <div className="stat-label">Calorías al día</div>
                  <div className="stat-value">{w.kcal.avg.toLocaleString('es-ES')} kcal</div>
                  <div className="tiny muted">
                    Media de {plural(w.kcal.days, 'día apuntado', 'días apuntados')}
                    {w.kcal.target ? ` · objetivo ${w.kcal.target.toLocaleString('es-ES')}` : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Block>
      )}

      {w.goals.length > 0 && (
        <Block title="🎯 Objetivos de la semana">
          <div className="card">
            {w.goals.map(({ goal: g, value }) => (
              <div key={g.id} className="budget-line">
                <div className="hstack">
                  <span className="grow">
                    {value >= g.target ? '🏆' : '🎯'} {g.title}
                  </span>
                  <b>
                    {formatKg(value)}/{formatKg(g.target)}
                    {g.unit ? ` ${g.unit}` : ''}
                  </b>
                </div>
                <div className="meter" role="img" aria-label={`${formatKg(value)} de ${formatKg(g.target)}`}>
                  <div style={{ width: `${Math.min(100, (value / g.target) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {w.bought > 0 && (
        <div className="card mt16 small">
          🛒 {shared ? 'Comprasteis' : 'Compraste'} {plural(w.bought, 'cosa', 'cosas')} de la lista.
        </div>
      )}

      {w.next.length > 0 && (
        <Block title="🔜 La semana que viene">
          <div className="list">
            {w.next.slice(0, 8).map((i) => (
              <AgendaRow key={i.key} item={i} trail={<b>{capitalize(formatRelative(i.date, today))}</b>} />
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}
