import { ArrowLeft, Plus, Search, ShoppingBasket, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Segmented, Sheet, toast } from '../components/ui';
import { menuHasAlternatives, menuOptions, recentFoods, stripQuantity } from '../lib/diary';
import { parseFoodText } from '../lib/foodParse';
import { customToRef, findFood, macroLine, macrosFor, quickAmounts, searchFoods, sumMacros, type FoodRef } from '../lib/foods';
import { fmt0, fmt1, parseDecimal, toInput } from '../lib/num';
import { searchOpenFoodFacts, type OffProduct } from '../lib/openFoodFacts';
import { fold } from '../lib/quickParse';
import { addFoodLog, deleteFoodLog, getState, saveCustomFood, useApp } from '../store/store';
import type { CustomFood, ISODate } from '../store/types';
import { CustomFoodSheet } from './CustomFoodSheet';

interface Picked {
  food: FoodRef;
  grams: string;
  /** Producto del súper que aún no está en «Mis alimentos» (se guarda al añadirlo). */
  pending?: Omit<CustomFood, 'id'>;
}

type OffState = { query: string; status: 'loading' | 'done' | 'error'; items: OffProduct[] };

/** Apuntar lo que se ha comido: escribiéndolo con cantidades o buscándolo. */
export function AddFoodSheet(props: { date: ISODate; meal: string; meals: string[]; menuText?: string; dateLabel?: string; onClose: () => void }) {
  const { date, meals, onClose } = props;
  const state = useApp();
  const options = useMemo(() => menuOptions(props.menuText ?? ''), [props.menuText]);
  const [meal, setMeal] = useState(props.meal);
  const [tab, setTab] = useState<'write' | 'search'>('write');
  // Varias líneas: si son partes de la comida se ponen todas; si son opciones, se elige.
  const [text, setText] = useState(() => (menuHasAlternatives(props.menuText ?? '') ? '' : options.join('\n')));
  const [grams, setGrams] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [off, setOff] = useState<OffState | null>(null);
  const [creating, setCreating] = useState<{ initial: Partial<CustomFood>; pick: boolean } | null>(null);

  // Escribir
  const rows = useMemo(() => {
    const seen = new Map<string, number>();
    return parseFoodText(text, state.customFoods).map((p) => {
      const base = `${p.food?.key ?? '?'}|${fold(p.source)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { ...p, key: `${base}|${n}` };
    });
  }, [text, state.customFoods]);
  const visible = rows.filter((r) => !removed.has(r.key));
  const known = visible.filter((r) => r.food);
  const unknown = visible.filter((r) => !r.food);
  const gramsOf = (r: (typeof rows)[number]) => (grams[r.key] !== undefined ? (parseDecimal(grams[r.key]) ?? 0) : r.grams);
  const toAdd = known.map((r) => ({ food: r.food!, grams: gramsOf(r) })).filter((x) => x.grams > 0);
  const writeTotal = sumMacros(toAdd.map((x) => macrosFor(x.food, x.grams)));

  // Buscar
  const results = useMemo(() => searchFoods(query, state.customFoods, 15), [query, state.customFoods]);
  const recents = useMemo(() => recentFoods(state.foodLog, state.customFoods, 10), [state.foodLog, state.customFoods]);
  const pickedGrams = picked ? (parseDecimal(picked.grams) ?? 0) : 0;

  const add = (list: { food: FoodRef; grams: number }[]) => {
    if (!list.length) return;
    const ids = addFoodLog(
      list.map(({ food, grams: g }) => ({
        date,
        meal,
        name: food.brand ? `${food.name} · ${food.brand}` : food.name,
        grams: Math.round(g * 10) / 10,
        foodId: food.key.startsWith('log:') ? undefined : food.key,
        ...macrosFor(food, g),
      })),
    );
    const kcal = sumMacros(list.map((x) => macrosFor(x.food, x.grams))).kcal;
    toast(`${list.length === 1 ? list[0].food.name : `${list.length} alimentos`} · ${fmt0(kcal)} kcal en ${meal.toLowerCase()}`, {
      action: 'Deshacer',
      onAction: () => deleteFoodLog(ids),
    });
    onClose();
  };

  const addPicked = () => {
    if (!picked || pickedGrams <= 0) return;
    let food = picked.food;
    if (picked.pending) {
      const id = saveCustomFood(picked.pending);
      food = findFood(id, getState().customFoods) ?? food;
    }
    add([{ food, grams: pickedGrams }]);
  };

  const pick = (food: FoodRef, g = food.portion) => setPicked({ food, grams: toInput(g) });

  const pickOff = (p: OffProduct) => {
    const existing = p.code ? state.customFoods.find((c) => c.barcode === p.code) : undefined;
    if (existing) return pick(customToRef(existing), p.servingGrams ?? existing.unitGrams ?? 100);
    const pending: Omit<CustomFood, 'id'> = {
      name: p.name,
      brand: p.brand,
      kcal: p.kcal,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      barcode: p.code || undefined,
      unitName: p.servingGrams ? 'ración' : undefined,
      unitGrams: p.servingGrams,
    };
    setPicked({ food: customToRef({ ...pending, id: 'off' }), grams: toInput(p.servingGrams ?? 100), pending });
  };

  const runOff = async () => {
    const q = query.trim();
    if (!q) return;
    setOff({ query: q, status: 'loading', items: [] });
    try {
      const items = await searchOpenFoodFacts(q);
      setOff((cur) => (cur?.query === q ? { query: q, status: 'done', items } : cur));
    } catch {
      setOff((cur) => (cur?.query === q ? { query: q, status: 'error', items: [] } : cur));
    }
  };

  const goSearch = (q: string) => {
    setQuery(q);
    setPicked(null);
    setOff(null);
    setTab('search');
  };

  const footer =
    tab === 'write' ? (
      <button className="btn block" disabled={!toAdd.length} onClick={() => add(toAdd)}>
        {toAdd.length ? `Añadir ${toAdd.length === 1 ? '1 alimento' : `${toAdd.length} alimentos`} · ${fmt0(writeTotal.kcal)} kcal` : 'Escribe lo que has comido'}
      </button>
    ) : picked ? (
      <button className="btn block" disabled={pickedGrams <= 0} onClick={addPicked}>
        Añadir · {fmt0(macrosFor(picked.food, pickedGrams).kcal)} kcal
      </button>
    ) : undefined;

  return (
    <Sheet open onClose={onClose} full title={props.dateLabel ? `Añadir · ${props.dateLabel}` : 'Añadir comida'} footer={footer}>
      <div className="chips scroll" style={{ marginBottom: 12 }}>
        {meals.map((m) => (
          <button key={m} className={`chip ${m === meal ? 'on' : ''}`} onClick={() => setMeal(m)} aria-pressed={m === meal}>
            {m}
          </button>
        ))}
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'write', label: 'Escribir' },
          { value: 'search', label: 'Buscar' },
        ]}
      />

      {tab === 'write' ? (
        <div className="mt12">
          <div className="field">
            <label htmlFor="af-text">¿Qué has comido?</label>
            <textarea
              id="af-text"
              className="textarea"
              autoFocus={!options.length}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="150 g de pollo con 80 g de arroz y una cucharada de aceite"
            />
            <p className="hint">Con cantidades si las sabes (g, ml, cucharadas, unidades…). Si no, pongo una ración normal y te la marco.</p>
          </div>

          {visible.length > 0 && (
            <div className="list flat mt12" style={{ padding: '2px 12px' }}>
              {visible.map((r) =>
                r.food ? (
                  <ParsedRow
                    key={r.key}
                    food={r.food}
                    value={grams[r.key] ?? toInput(r.grams)}
                    estimated={r.estimated && grams[r.key] === undefined}
                    source={r.source}
                    onChange={(v) => setGrams((g) => ({ ...g, [r.key]: v }))}
                    onRemove={() => setRemoved((s) => new Set(s).add(r.key))}
                  />
                ) : (
                  <div key={r.key} className="food-row unknown">
                    <div className="fmain">
                      <div className="fn">«{r.source}»</div>
                      <div className="fs">No lo tengo en la lista</div>
                    </div>
                    <div className="hstack">
                      <button className="btn secondary small" onClick={() => goSearch(stripQuantity(r.source) || r.source)}>
                        Buscar
                      </button>
                      <button className="btn secondary small" onClick={() => setCreating({ initial: { name: stripQuantity(r.source) }, pick: false })}>
                        Crear
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
          {toAdd.length > 1 && (
            <p className="small muted mt8" style={{ textAlign: 'right' }}>
              Total: <b>{fmt0(writeTotal.kcal)} kcal</b> · {macroLine(writeTotal)}
            </p>
          )}
          {unknown.length > 0 && <p className="hint mt8">Lo que no reconozco no se suma: búscalo o créalo con sus valores.</p>}
          {options.length > 1 && (
            <div className="field mt12">
              <span className="label">Del menú (toca para quitar o poner)</span>
              <div className="examples">
                {options.map((o) => {
                  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
                  const on = lines.some((l) => fold(l) === fold(o));
                  return (
                    <button
                      key={o}
                      className={on ? 'on' : ''}
                      aria-pressed={on}
                      onClick={() => setText(on ? lines.filter((l) => fold(l) !== fold(o)).join('\n') : [...lines, o].join('\n'))}
                    >
                      {on ? '✓ ' : '+ '}
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="mt12">
          <div className="hstack">
            <input
              type="search"
              className="input grow"
              autoFocus={!query}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
              }}
              placeholder="Buscar alimento o código de barras"
              aria-label="Buscar alimento"
              enterKeyHint="search"
            />
          </div>

          {picked ? (
            <PickedPanel picked={picked} onGrams={(g) => setPicked({ ...picked, grams: g })} onBack={() => setPicked(null)} />
          ) : (
            <>
              {query.trim() ? (
                <>
                  {results.length > 0 && (
                    <div className="list flat mt12">
                      {results.map((f) => (
                        <FoodResult key={f.key} food={f} onPick={() => pick(f)} />
                      ))}
                    </div>
                  )}
                  {!results.length && <p className="small muted mt12">No está en la lista de alimentos habituales.</p>}

                  <button className="btn secondary block mt12" onClick={runOff} disabled={off?.status === 'loading' && off.query === query.trim()}>
                    <ShoppingBasket size={18} /> {/^\d{8,14}$/.test(query.trim()) ? 'Buscar el código de barras' : 'Buscar en productos del súper'}
                  </button>
                  {off && off.query === query.trim() && (
                    <div className="mt12">
                      {off.status === 'loading' && <p className="small muted center">Buscando…</p>}
                      {off.status === 'error' && <p className="small muted center">No se pudo buscar. ¿Hay conexión?</p>}
                      {off.status === 'done' && !off.items.length && <p className="small muted center">Sin resultados en productos del súper.</p>}
                      {off.items.length > 0 && (
                        <div className="list flat">
                          {off.items.map((p, i) => (
                            <button key={`${p.code}-${i}`} className="row tappable no-lead" onClick={() => pickOff(p)}>
                              <div className="body">
                                <div className="title">{p.name}</div>
                                <div className="meta">
                                  <span>{[p.brand, `${fmt0(p.kcal)} kcal/100 g`].filter(Boolean).join(' · ')}</span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {off.items.length > 0 && <p className="hint mt8">Datos de Open Food Facts (base abierta): revisa que cuadren con la etiqueta.</p>}
                    </div>
                  )}
                  <button className="btn ghost wrap block mt8" onClick={() => setCreating({ initial: { name: stripQuantity(query) || query.trim() }, pick: true })}>
                    <Plus size={18} /> Crear «{stripQuantity(query) || query.trim()}»
                  </button>
                </>
              ) : (
                <>
                  {recents.length > 0 && (
                    <>
                      <div className="label mt16" style={{ marginBottom: 6 }}>
                        Recientes
                      </div>
                      <div className="list flat">
                        {recents.map(({ food, grams: g }) => (
                          <FoodResult key={food.key} food={food} grams={g} onPick={() => pick(food, g)} />
                        ))}
                      </div>
                    </>
                  )}
                  {state.customFoods.length > 0 && (
                    <>
                      <div className="label mt16" style={{ marginBottom: 6 }}>
                        Mis alimentos
                      </div>
                      <div className="list flat">
                        {[...state.customFoods]
                          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                          .map((c) => {
                            const f = customToRef(c);
                            return <FoodResult key={f.key} food={f} onPick={() => pick(f)} />;
                          })}
                      </div>
                    </>
                  )}
                  {!recents.length && !state.customFoods.length && (
                    <p className="small muted mt16 center">
                      <Search size={14} style={{ verticalAlign: -2 }} /> Busca entre unos 200 alimentos habituales o en productos del súper (por nombre o código de barras).
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {creating && (
        <CustomFoodSheet
          initial={creating.initial}
          onClose={() => setCreating(null)}
          onSaved={(id) => {
            if (!creating.pick) return; // en «Escribir» el texto se vuelve a leer solo
            const f = findFood(id, getState().customFoods);
            if (f) pick(f);
          }}
        />
      )}
    </Sheet>
  );
}

function ParsedRow(props: { food: FoodRef; value: string; estimated: boolean; source: string; onChange: (v: string) => void; onRemove: () => void }) {
  const { food } = props;
  const g = parseDecimal(props.value) ?? 0;
  const m = macrosFor(food, g);
  return (
    <div className="food-row">
      <div className="fmain">
        <div className="fn">{food.name}</div>
        <div className="fs">«{props.source}»</div>
      </div>
      <label className="grams">
        <input className={`input ${props.estimated ? 'est' : ''}`} inputMode="decimal" value={props.value} onChange={(e) => props.onChange(e.target.value)} aria-label={`Gramos de ${food.name}`} />
        <span>g</span>
      </label>
      <div className="fk">
        {fmt0(m.kcal)}
        <small> kcal</small>
      </div>
      <button className="icon-btn small plain" aria-label={`Quitar ${food.name}`} onClick={props.onRemove}>
        <X size={16} />
      </button>
      {props.estimated && (
        <div className="funits">
          <span className="warn">
            <TriangleAlert size={13} /> ¿Cuánto fue?
          </span>
          {quickAmounts(food, 3).map((q) => (
            <button key={q.label} className="chip mini" onClick={() => props.onChange(toInput(q.grams))}>
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FoodResult({ food, grams, onPick }: { food: FoodRef; grams?: number; onPick: () => void }) {
  return (
    <button className="row tappable no-lead" onClick={onPick}>
      <div className="body">
        <div className="title">{food.name}</div>
        <div className="meta">
          <span>
            {[food.brand, grams ? `${fmt1(grams)} g · ${fmt0(macrosFor(food, grams).kcal)} kcal` : `${fmt0(food.kcal)} kcal/100 g`, food.custom ? 'mío' : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>
      <div className="trail">
        <Plus size={18} />
      </div>
    </button>
  );
}

function PickedPanel({ picked, onGrams, onBack }: { picked: Picked; onGrams: (g: string) => void; onBack: () => void }) {
  const { food } = picked;
  const g = parseDecimal(picked.grams) ?? 0;
  const m = macrosFor(food, g);
  return (
    <div className="card flat mt12" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
      <button className="link-btn small" onClick={onBack} style={{ marginLeft: -2 }}>
        <ArrowLeft size={15} style={{ verticalAlign: -2 }} /> Otro alimento
      </button>
      <div style={{ fontWeight: 700, fontSize: 18, marginTop: 6 }}>{food.name}</div>
      <div className="small muted">
        {food.brand ? `${food.brand} · ` : ''}Por 100 g: {fmt0(food.kcal)} kcal · {macroLine(food)}
      </div>
      <div className="hstack mt12" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="pk-g">Cantidad</label>
          <label className="grams">
            <input id="pk-g" className="input" inputMode="decimal" autoFocus value={picked.grams} onChange={(e) => onGrams(e.target.value)} />
            <span>g</span>
          </label>
        </div>
        <div className="grow" style={{ textAlign: 'right', paddingBottom: 4 }}>
          <div style={{ fontWeight: 750, fontSize: 22 }}>{fmt0(m.kcal)} kcal</div>
          <div className="small muted">{macroLine(m)}</div>
        </div>
      </div>
      <div className="chips mt12">
        {quickAmounts(food).map((q) => (
          <button key={q.label} className={`chip mini ${q.grams === g ? 'on' : ''}`} onClick={() => onGrams(toInput(q.grams))}>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
