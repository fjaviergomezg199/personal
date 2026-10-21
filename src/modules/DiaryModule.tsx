import { ChevronLeft, ChevronRight, ClipboardList, Plus, Repeat2, Target, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MacroSummary } from '../components/MacroSummary';
import { Sheet, toast } from '../components/ui';
import { addDays, capitalize, daysBetween, formatLong, weekdayIndex } from '../lib/dates';
import { mealForNow, mealsForDay, menuOptions } from '../lib/diary';
import { findFood, macroLine, macrosFor, quickAmounts, scaleMacros, sumMacros } from '../lib/foods';
import { fmt0, fmt1, parseDecimal, toInput } from '../lib/num';
import { clearQuery, useRoute } from '../lib/router';
import { useToday } from '../lib/useToday';
import { addFoodLog, deleteFoodLog, restoreFoodLog, setNutritionTargets, updateFoodLog, useApp } from '../store/store';
import type { Area, FoodLogItem, ISODate } from '../store/types';
import { AddFoodSheet } from '../sheets/AddFoodSheet';
import { CustomFoodsSheet } from '../sheets/CustomFoodSheet';

function dayLabel(date: ISODate, today: ISODate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Hoy';
  if (diff === -1) return 'Ayer';
  if (diff === 1) return 'Mañana';
  return capitalize(formatLong(date).split(',')[0]);
}

/** Calorías y macros: lo que se ha comido cada día, por comidas, frente al objetivo. */
export function DiaryModule({ area }: { area: Area }) {
  const state = useApp();
  const today = useToday();
  const [sel, setSel] = useState<{ base: ISODate; date: ISODate } | null>(null);
  const date = sel && sel.base === today ? sel.date : today;
  const setDate = (d: ISODate) => setSel({ base: today, date: d });
  const route = useRoute();
  const [adding, setAdding] = useState<{ meal: string; menuText?: string } | null>(() =>
    route.query.get('nuevo') ? { meal: mealForNow(mealsForDay(area.menu?.meals, [])) } : null,
  );
  useEffect(() => {
    if (route.query.get('nuevo')) clearQuery('nuevo');
  }, [route.query]);
  const [editing, setEditing] = useState<FoodLogItem | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [foodsOpen, setFoodsOpen] = useState(false);

  const logs = useMemo(() => state.foodLog.filter((l) => l.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [state.foodLog, date]);
  const prev = useMemo(() => state.foodLog.filter((l) => l.date === addDays(date, -1)), [state.foodLog, date]);
  const total = useMemo(() => sumMacros(logs), [logs]);
  const meals = mealsForDay(area.menu?.meals, logs);
  const menuDay = area.menu?.days[weekdayIndex(date)] ?? {};
  const targets = state.nutritionTargets;
  const hasTargets = !!(targets.kcal || targets.protein || targets.carbs || targets.fat);
  const label = dayLabel(date, today);

  const repeat = (meal: string) => {
    const src = prev.filter((l) => l.meal === meal);
    const ids = addFoodLog(src.map(({ id: _id, createdAt: _c, ...rest }) => ({ ...rest, date })));
    toast(`${meal}: lo mismo que ayer`, { action: 'Deshacer', onAction: () => deleteFoodLog(ids) });
  };

  return (
    <div>
      <div className="dv-nav card" style={{ padding: '8px 6px' }}>
        <button className="icon-btn small plain" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={20} />
        </button>
        <button className="grow center" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => setDate(today)} aria-label="Volver a hoy">
          <div style={{ fontWeight: 750 }}>{label}</div>
          <div className="tiny muted">{capitalize(formatLong(date))}</div>
        </button>
        <button className="icon-btn small plain" aria-label="Día siguiente" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div className={`card tone-${area.color} mt12`}>
        <MacroSummary total={total} targets={targets} />
        {hasTargets ? (
          <button className="link-btn small mt8" onClick={() => setTargetsOpen(true)}>
            <Target size={14} style={{ verticalAlign: -2 }} /> Cambiar objetivo
          </button>
        ) : (
          <div className="hstack mt12">
            <span className="small muted grow">Pon tu objetivo diario para ver cuánto te queda.</span>
            <button className="btn small" onClick={() => setTargetsOpen(true)}>
              <Target size={16} /> Objetivo
            </button>
          </div>
        )}
      </div>

      <button className="btn block mt12" onClick={() => setAdding({ meal: date === today ? mealForNow(meals) : meals[0], menuText: undefined })}>
        <Plus size={18} /> Apuntar lo que he comido
      </button>

      <div className="mt16">
        {meals.map((meal) => {
          const items = logs.filter((l) => l.meal === meal);
          const sum = sumMacros(items);
          const fromMenu = menuDay[meal];
          const prevItems = prev.filter((l) => l.meal === meal);
          return (
            <div key={meal} className={`card meal-card tone-${area.color}`}>
              <div className="mh">
                <span className="n">{meal}</span>
                {items.length > 0 && <span className="k">{fmt0(sum.kcal)} kcal</span>}
                <button className="icon-btn small" aria-label={`Añadir a ${meal}`} onClick={() => setAdding({ meal, menuText: fromMenu })}>
                  <Plus size={17} />
                </button>
              </div>
              {items.map((it) => (
                <button key={it.id} className="food-line" onClick={() => setEditing(it)}>
                  <span className="grow">
                    <span className="fn">{it.name}</span>
                    <span className="fs">
                      {fmt1(it.grams)} g · {macroLine(it)}
                    </span>
                  </span>
                  <span className="fk">{fmt0(it.kcal)}</span>
                </button>
              ))}
              {!items.length && (fromMenu || prevItems.length > 0) && (
                <div className="meal-sugg">
                  {fromMenu && (
                    <button className="chip mini" onClick={() => setAdding({ meal, menuText: fromMenu })}>
                      <ClipboardList size={14} />
                      <span>
                        Del menú: {menuOptions(fromMenu)[0] ?? fromMenu}
                        {menuOptions(fromMenu).length > 1 ? '…' : ''}
                      </span>
                    </button>
                  )}
                  {prevItems.length > 0 && (
                    <button className="chip mini" onClick={() => repeat(meal)}>
                      <Repeat2 size={14} />
                      <span>Como ayer · {fmt0(sumMacros(prevItems).kcal)} kcal</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hstack mt16" style={{ justifyContent: 'space-between' }}>
        <button className="link-btn" onClick={() => setFoodsOpen(true)}>
          Mis alimentos{state.customFoods.length ? ` (${state.customFoods.length})` : ''}
        </button>
        {hasTargets && (
          <button className="link-btn" onClick={() => setTargetsOpen(true)}>
            Objetivos
          </button>
        )}
      </div>
      <p className="hint mt8">Valores aproximados por alimento; los hidratos van sin fibra, como en las etiquetas.</p>

      {adding && (
        <AddFoodSheet
          date={date}
          meal={adding.meal}
          meals={meals}
          menuText={adding.menuText}
          dateLabel={date === today ? undefined : label}
          onClose={() => setAdding(null)}
        />
      )}
      {editing && <FoodLogSheet item={editing} meals={meals} onClose={() => setEditing(null)} />}
      {targetsOpen && <TargetsSheet onClose={() => setTargetsOpen(false)} />}
      {foodsOpen && <CustomFoodsSheet onClose={() => setFoodsOpen(false)} />}
    </div>
  );
}

/** Cambiar la cantidad o la comida de algo ya apuntado. */
function FoodLogSheet({ item, meals, onClose }: { item: FoodLogItem; meals: string[]; onClose: () => void }) {
  const state = useApp();
  const ref = findFood(item.foodId, state.customFoods);
  const [grams, setGrams] = useState(toInput(item.grams));
  const [meal, setMeal] = useState(item.meal);
  const g = parseDecimal(grams) ?? 0;
  const m = ref ? macrosFor(ref, g) : item.grams > 0 ? scaleMacros(item, g / item.grams) : item;

  const save = () => {
    if (g <= 0) return;
    updateFoodLog(item.id, { grams: g, meal, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat });
    onClose();
  };
  const remove = () => {
    deleteFoodLog([item.id]);
    onClose();
    toast(`${item.name}: quitado`, { action: 'Deshacer', onAction: () => restoreFoodLog([item]) });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      headerExtra={
        <button className="icon-btn small" aria-label="Quitar" onClick={remove}>
          <Trash2 size={16} />
        </button>
      }
      footer={
        <button className="btn block" disabled={g <= 0} onClick={save}>
          Guardar
        </button>
      }
    >
      <div className="hstack" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="fl-g">Cantidad</label>
          <label className="grams">
            <input id="fl-g" className="input" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
            <span>g</span>
          </label>
        </div>
        <div className="grow" style={{ textAlign: 'right', paddingBottom: 4 }}>
          <div style={{ fontWeight: 750, fontSize: 'calc(22px * var(--fs))' }}>{fmt0(m.kcal)} kcal</div>
          <div className="small muted">{macroLine(m)}</div>
        </div>
      </div>
      {ref && (
        <div className="chips mt12">
          {quickAmounts(ref).map((q) => (
            <button key={q.label} className={`chip mini ${q.grams === g ? 'on' : ''}`} onClick={() => setGrams(toInput(q.grams))}>
              {q.label}
            </button>
          ))}
        </div>
      )}
      <div className="field mt16">
        <span className="label">Comida</span>
        <div className="chips">
          {meals.map((x) => (
            <button key={x} className={`chip ${x === meal ? 'on' : ''}`} onClick={() => setMeal(x)} aria-pressed={x === meal}>
              {x}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** Objetivo diario de calorías y macros (el de la nutri, o un reparto automático). */
function TargetsSheet({ onClose }: { onClose: () => void }) {
  const state = useApp();
  const t = state.nutritionTargets;
  const [kcal, setKcal] = useState(toInput(t.kcal));
  const [protein, setProtein] = useState(toInput(t.protein));
  const [carbs, setCarbs] = useState(toInput(t.carbs));
  const [fat, setFat] = useState(toInput(t.fat));
  const k = parseDecimal(kcal) ?? 0;
  const p = parseDecimal(protein) ?? 0;
  const c = parseDecimal(carbs) ?? 0;
  const f = parseDecimal(fat) ?? 0;
  const fromMacros = Math.round(p * 4 + c * 4 + f * 9);
  const pct = (x: number) => (fromMacros ? Math.round((x / fromMacros) * 100) : 0);

  const split = () => {
    if (!k) return;
    setProtein(String(Math.round((k * 0.3) / 4)));
    setCarbs(String(Math.round((k * 0.4) / 4)));
    setFat(String(Math.round((k * 0.3) / 9)));
  };
  const save = () => {
    setNutritionTargets({
      kcal: k > 0 ? Math.round(k) : fromMacros || undefined,
      protein: p > 0 ? Math.round(p) : undefined,
      carbs: c > 0 ? Math.round(c) : undefined,
      fat: f > 0 ? Math.round(f) : undefined,
    });
    toast('Objetivo guardado');
    onClose();
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title="Objetivo diario"
      footer={
        <button className="btn block" onClick={save}>
          Guardar
        </button>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Si tu nutri te ha dado cifras, ponlas tal cual. Si solo tienes las calorías, puedo repartirlas en macros.
      </p>
      {field('tg-k', 'Calorías al día (kcal)', kcal, setKcal)}
      <button className="btn secondary small mt8" disabled={!k} onClick={split}>
        Repartir en macros
      </button>
      <p className="hint">30 % proteína, 40 % hidratos y 30 % grasa: un reparto equilibrado de partida.</p>
      <div className="two mt16">
        {field('tg-p', 'Proteína (g)', protein, setProtein)}
        {field('tg-c', 'Hidratos (g)', carbs, setCarbs)}
      </div>
      <div className="two mt12">
        {field('tg-f', 'Grasa (g)', fat, setFat)}
        <div />
      </div>
      {fromMacros > 0 && (
        <p className="hint mt12">
          Con estos macros salen {fmt0(fromMacros)} kcal ({pct(p * 4)} % proteína · {pct(c * 4)} % hidratos · {pct(f * 9)} % grasa)
          {k > 0 && Math.abs(fromMacros - k) > k * 0.05 ? `, ${fromMacros > k ? 'más' : 'menos'} de las ${fmt0(k)} que has puesto` : ''}.
        </p>
      )}
      {(t.kcal || t.protein || t.carbs || t.fat) && (
        <button
          className="btn ghost block mt16"
          onClick={() => {
            setNutritionTargets({});
            onClose();
          }}
        >
          Quitar objetivo
        </button>
      )}
    </Sheet>
  );
}
