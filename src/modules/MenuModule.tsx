import { ClipboardPaste, Copy, Pencil, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty, Sheet, toast } from '../components/ui';
import { capitalize, todayISO, WEEKDAY_LETTERS, WEEKDAYS, weekdayIndex } from '../lib/dates';
import { copyText } from '../lib/files';
import { DEFAULT_MEALS, menuPrompt, parseMenu } from '../lib/importers';
import { setMeal, setMenu, updateArea } from '../store/store';
import type { Area, Menu } from '../store/types';
import { pasteFromClipboard } from './ImportPlanSheet';

export function MenuModule({ area }: { area: Area }) {
  const todayIdx = weekdayIndex(todayISO());
  const [day, setDay] = useState(todayIdx);
  const [editing, setEditing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [mealsEdit, setMealsEdit] = useState(false);
  const menu: Menu = area.menu ?? { meals: [...DEFAULT_MEALS], days: {} };
  const dayMenu = menu.days[day] ?? {};
  const meals = [...menu.meals, ...Object.keys(dayMenu).filter((m) => !menu.meals.includes(m))];
  const hasAny = Object.values(menu.days).some((d) => Object.keys(d ?? {}).length);

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button className="btn secondary small" onClick={() => setImporting(true)}>
          <Sparkles size={16} /> Importar menú
        </button>
        <button className="btn secondary small" onClick={() => setMealsEdit(true)}>
          <Pencil size={16} /> Comidas
        </button>
      </div>

      <div className="week-strip" style={{ marginBottom: 12 }}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <button key={l} className={`day-pill ${i === todayIdx ? 'today' : ''} ${i === day ? 'on' : ''}`} onClick={() => setDay(i)} aria-label={WEEKDAYS[i]}>
            <span className="n" style={{ fontSize: 16 }}>
              {l}
            </span>
            <span className="dots">{Object.keys(menu.days[i] ?? {}).length ? <i /> : null}</span>
          </button>
        ))}
      </div>

      {!hasAny && (
        <div className="card" style={{ marginBottom: 12 }}>
          <Empty emoji="🥗" title="Aún no hay menú" text="Importa el plan de tu nutri con ayuda de Claude, o escribe cada comida tocándola abajo." />
        </div>
      )}

      <div className={`card tone-${area.color}`}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {capitalize(WEEKDAYS[day])}
          {day === todayIdx ? ' · hoy' : ''}
        </div>
        {meals.map((m) => (
          <div key={m} className="meal" role="button" tabIndex={0} onClick={() => setEditing(m)} style={{ cursor: 'pointer' }}>
            <div className="m">{m}</div>
            <div className="x">{dayMenu[m] ?? <span className="faint">Toca para escribir</span>}</div>
          </div>
        ))}
      </div>

      <div className="field mt16">
        <label htmlFor="mn-notes">Indicaciones de la nutri</label>
        <textarea
          id="mn-notes"
          className="textarea"
          defaultValue={menu.notes ?? ''}
          placeholder="Ej. 2 L de agua al día, fruta entre horas, sin azúcar añadido…"
          onBlur={(e) => e.target.value !== (menu.notes ?? '') && setMenu(area.id, { ...menu, notes: e.target.value || undefined })}
        />
      </div>

      {editing && <MealSheet area={area} day={day} meal={editing} text={dayMenu[editing] ?? ''} onClose={() => setEditing(null)} />}
      {importing && <ImportMenuSheet area={area} onClose={() => setImporting(false)} />}
      {mealsEdit && <MealsSheet area={area} menu={menu} onClose={() => setMealsEdit(false)} />}
    </div>
  );
}

function MealSheet({ area, day, meal, text, onClose }: { area: Area; day: number; meal: string; text: string; onClose: () => void }) {
  const [value, setValue] = useState(text);
  const [allDays, setAllDays] = useState(false);
  const save = () => {
    if (allDays) for (let d = 0; d < 7; d++) setMeal(area.id, d, meal, value);
    else setMeal(area.id, day, meal, value);
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${meal} · ${WEEKDAYS[day]}`}
      footer={
        <button className="btn block" onClick={save}>
          Guardar
        </button>
      }
    >
      <textarea className="textarea tall" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Qué toca. Si hay opciones, una por línea." />
      <label className="switch-row">
        <div className="grow">
          <div className="t">Igual todos los días</div>
          <div className="d">Útil para desayunos o media mañana que se repiten.</div>
        </div>
        <span className="switch">
          <input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} />
          <span />
        </span>
      </label>
    </Sheet>
  );
}

function MealsSheet({ area, menu, onClose }: { area: Area; menu: Menu; onClose: () => void }) {
  const [value, setValue] = useState(menu.meals.join('\n'));
  const save = () => {
    const meals = value
      .split('\n')
      .map((m) => m.trim())
      .filter(Boolean);
    if (!meals.length) return;
    updateArea(area.id, { menu: { ...menu, meals } });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Comidas del día"
      footer={
        <button className="btn block" onClick={save}>
          Guardar
        </button>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        Una por línea, en orden (por ejemplo, añade «Pre-entreno» o quita «Merienda»).
      </p>
      <textarea className="textarea tall" value={value} onChange={(e) => setValue(e.target.value)} />
    </Sheet>
  );
}

function ImportMenuSheet({ area, onClose }: { area: Area; onClose: () => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseMenu(text) : null), [text]);
  const prompt = menuPrompt();
  const dayCount = parsed ? Object.keys(parsed.days).length : 0;

  const save = () => {
    if (!parsed) return;
    const current = area.menu ?? { meals: [...DEFAULT_MEALS], days: {} };
    setMenu(area.id, { ...current, meals: parsed.meals, days: parsed.days });
    toast('Menú importado');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title="Importar menú"
      footer={
        <button className="btn block" disabled={!dayCount} onClick={save}>
          {dayCount ? `Guardar menú (${dayCount} días)` : 'Pega primero el menú'}
        </button>
      }
    >
      <div className="callout" style={{ marginBottom: 16 }}>
        <b>Con Claude:</b>
        <ol>
          <li>Abre un chat con Claude y adjunta el PDF o la foto del plan de tu nutri.</li>
          <li>Pega el mensaje de abajo y envíalo.</li>
          <li>Copia su respuesta y pégala aquí.</li>
        </ol>
        También puedes pegar el menú tal cual si ya está por días («Lunes» y debajo «Desayuno: …»).
      </div>
      <div className="field">
        <span className="label">Mensaje para Claude</span>
        <div className="code-box prose" style={{ whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}>
          {prompt}
        </div>
        <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={async () => toast((await copyText(prompt)) ? 'Mensaje copiado' : 'No se pudo copiar')}>
          <Copy size={16} /> Copiar mensaje
        </button>
      </div>
      <div className="field">
        <div className="hstack">
          <label htmlFor="im-text" className="grow">
            Menú
          </label>
          <button
            className="link-btn"
            onClick={async () => {
              const t = await pasteFromClipboard();
              if (t) setText(t);
              else toast('Mantén pulsado el cuadro y elige «Pegar»');
            }}
          >
            <ClipboardPaste size={15} style={{ verticalAlign: -2 }} /> Pegar
          </button>
        </div>
        <textarea id="im-text" className="textarea tall mono" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"lunes": {"Desayuno": "…", "Comida": "…"}}' />
      </div>
      {text.trim() && !dayCount && <p className="hint">No encuentro días de la semana en el texto. Prueba con el mensaje para Claude.</p>}
      {parsed && dayCount > 0 && (
        <div className="card">
          <div className="label">Vista previa</div>
          {Object.entries(parsed.days)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([d, m]) => (
              <div key={d} className="small" style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <b>{capitalize(WEEKDAYS[Number(d)])}:</b> {Object.keys(m).join(', ')}
              </div>
            ))}
        </div>
      )}
    </Sheet>
  );
}
