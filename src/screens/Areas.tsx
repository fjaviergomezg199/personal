import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../components/ui';
import { todayISO } from '../lib/dates';
import { currentPeriod, daysLeft, eurInt, summarizePeriod } from '../lib/finance';
import { sumMacros } from '../lib/foods';
import { fmt0, fmtFixed } from '../lib/num';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { areaTasks, planForWeek, sortedAreas, todaysMenu } from '../store/selectors';
import { addArea, useApp } from '../store/store';
import { AREA_COLORS, EMOJI_CHOICES, TEMPLATES, type TemplateInfo } from '../store/templates';
import type { AppState, Area, AreaColor } from '../store/types';

/** «72,4 kg» (la última medida del primer tipo, normalmente el peso). */
function latestMetric(s: AppState): string | null {
  for (const t of s.metricTypes) {
    const last = s.metrics.filter((m) => m.metricId === t.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last) return `${fmtFixed(last.value, t.decimals)} ${t.unit}`;
  }
  return null;
}

function areaSummary(s: AppState, a: Area, today: string): string {
  const plan = s.plan.filter((p) => p.areaId === a.id && p.date === today);
  if (plan.length) return `Hoy: ${plan.map((p) => p.title).join(', ')}`;
  if (a.modules.includes('shopping') && a.template === 'home') {
    const n = s.listItems.filter((i) => i.list === 'compra' && !i.done && !i.deleted).length;
    if (n) return `🛒 ${n} en la compra${s.share ? ' · compartida' : ''}`;
  }
  if (a.modules.includes('diary')) {
    const kcal = sumMacros(s.foodLog.filter((l) => l.date === today)).kcal;
    if (kcal) return `🔥 ${fmt0(kcal)}${s.nutritionTargets.kcal ? ` / ${fmt0(s.nutritionTargets.kcal)}` : ''} kcal hoy`;
  }
  if (a.modules.includes('money')) {
    const acc = s.finance.accounts.personal;
    const p = currentPeriod(acc, today);
    const spent = summarizePeriod(s.finance, 'personal', p, today).spent;
    if (spent || acc.periodStarts.length) {
      const left = daysLeft(p, today);
      return `💶 ${eurInt(spent)} este periodo${left ? ` · quedan ${left} días` : ''}`;
    }
  }
  if (a.modules.includes('menu') && a.menu) {
    const meals = todaysMenu(a, today);
    if (meals.length) return `Hoy: ${meals[0].text.split('\n')[0]}`;
  }
  const tasks = areaTasks(s, a.id).filter((t) => !t.done);
  if (tasks.length) return `${tasks.length} ${tasks.length === 1 ? 'pendiente' : 'pendientes'}`;
  if (a.modules.includes('plan')) {
    const week = planForWeek(s, a.id, today);
    if (week.length) return `${week.filter((w) => w.done).length}/${week.length} esta semana`;
    return s.plan.some((p) => p.areaId === a.id && p.date > today) ? 'Nada hoy' : 'Sin plan todavía';
  }
  if (a.modules.includes('metrics')) {
    const last = latestMetric(s);
    if (last) return `⚖️ ${last}`;
  }
  if (a.modules.includes('menu')) return 'Sin menú todavía';
  if (a.modules.includes('shopping')) return s.share ? 'Lista compartida' : 'Lista de la compra';
  if (a.modules.includes('tasks')) return 'Sin pendientes';
  return '';
}

export function Areas() {
  const state = useApp();
  const route = useRoute();
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const areas = useMemo(() => sortedAreas(state), [state]);

  const nueva = route.query.get('nueva');
  useEffect(() => {
    if (nueva) {
      clearQuery('nueva');
      setAdding(true);
    }
  }, [nueva]);

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1>Áreas</h1>
          <div className="sub">Cada parte de tu vida, con lo suyo</div>
        </div>
        <div className="actions">
          <button className="icon-btn" aria-label="Buscar" onClick={() => navigate('/buscar')}>
            <Search size={19} />
          </button>
          <button className="icon-btn primary" aria-label="Añadir área" onClick={() => setAdding(true)}>
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="area-grid">
        {areas.map((a) => (
          <button key={a.id} className={`area-tile tone-${a.color}`} onClick={() => navigate(`/areas/${a.id}`)}>
            <div className="em" aria-hidden>
              {a.emoji}
            </div>
            <div>
              <div className="nm">{a.name}</div>
              <div className="sm">{areaSummary(state, a, today)}</div>
            </div>
          </button>
        ))}
        <button className="area-tile add" onClick={() => setAdding(true)}>
          <Plus size={24} />
          Añadir área
        </button>
      </div>

      {areas.length === 0 && (
        <p className="hint center mt16">
          Por ejemplo: <b>Estudios</b> para tu planificación de Historia del Arte, <b>Running</b>, <b>Nutrición</b> o un <b>Trabajo</b> con sus pendientes.
        </p>
      )}

      {adding && <AddAreaSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

export function AddAreaSheet({ onClose }: { onClose: () => void }) {
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState<AreaColor>('violet');

  const choose = (t: TemplateInfo) => {
    setTemplate(t);
    setName(t.key === 'custom' ? '' : t.name);
    setEmoji(t.emoji);
    setColor(t.color);
  };

  const create = () => {
    if (!template || !name.trim()) return;
    const id = addArea(template.key, { name: name.trim(), emoji, color });
    navigate(`/areas/${id}`); // cierra también la hoja
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={template ? 'Personaliza el área' : 'Nueva área'}
      footer={
        template ? (
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setTemplate(null)}>
              Atrás
            </button>
            <button className="btn" onClick={create} disabled={!name.trim()}>
              Crear
            </button>
          </div>
        ) : undefined
      }
    >
      {!template ? (
        <div className="stack">
          <p className="muted small" style={{ margin: '0 2px 4px' }}>
            Elige un tipo. Luego puedes cambiar el nombre y los bloques que tiene.
          </p>
          {TEMPLATES.map((t) => (
            <button key={t.key} className={`template-card tone-${t.color}`} onClick={() => choose(t)}>
              <div className="em" aria-hidden>
                {t.emoji}
              </div>
              <div className="grow">
                <div className="t">{t.name}</div>
                <div className="d">{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className="field">
            <label htmlFor="na-name">Nombre</label>
            <input
              id="na-name"
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={template.key === 'work' ? 'Ej. Academia, Ministerio…' : 'Nombre del área'}
            />
          </div>
          <div className="field">
            <span className="label">Icono</span>
            <div className="emoji-grid">
              {Array.from(new Set([template.emoji, ...EMOJI_CHOICES])).map((e) => (
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
        </div>
      )}
    </Sheet>
  );
}
