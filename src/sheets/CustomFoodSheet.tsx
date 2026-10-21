import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { confirmDialog, Empty, Sheet, toast } from '../components/ui';
import { r1 } from '../lib/foods';
import { fmt0, parseDecimal, toInput } from '../lib/num';
import { deleteCustomFood, saveCustomFood, useApp } from '../store/store';
import type { CustomFood } from '../store/types';

/** Crear o editar un alimento propio (valores por 100 g, como en la etiqueta). */
export function CustomFoodSheet({ initial, onClose, onSaved }: { initial?: Partial<CustomFood>; onClose: () => void; onSaved?: (id: string) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [kcal, setKcal] = useState(toInput(initial?.kcal));
  const [protein, setProtein] = useState(toInput(initial?.protein));
  const [carbs, setCarbs] = useState(toInput(initial?.carbs));
  const [fat, setFat] = useState(toInput(initial?.fat));
  const [unitName, setUnitName] = useState(initial?.unitName ?? '');
  const [unitGrams, setUnitGrams] = useState(toInput(initial?.unitGrams));

  const p = parseDecimal(protein) ?? 0;
  const c = parseDecimal(carbs) ?? 0;
  const f = parseDecimal(fat) ?? 0;
  const fromMacros = Math.round(p * 4 + c * 4 + f * 9);
  const k = kcal.trim() ? parseDecimal(kcal) : p || c || f ? fromMacros : null;
  const valid = !!name.trim() && k !== null && k >= 0;
  const editing = !!initial?.id;

  const save = () => {
    if (!valid) return;
    const grams = parseDecimal(unitGrams);
    const id = saveCustomFood({
      id: initial?.id,
      name: name.trim(),
      brand: brand.trim() || undefined,
      kcal: Math.round(k!),
      protein: r1(p),
      carbs: r1(c),
      fat: r1(f),
      unitName: grams ? unitName.trim() || 'unidad' : undefined,
      unitGrams: grams || undefined,
      barcode: initial?.barcode,
    });
    toast(editing ? 'Alimento guardado' : 'Alimento creado');
    onSaved?.(id);
    onClose();
  };

  const remove = async () => {
    if (!initial?.id) return;
    const ok = await confirmDialog({ title: `¿Borrar «${initial.name}»?`, message: 'Lo que ya apuntaste con él se queda como está.', confirm: 'Borrar', danger: true });
    if (!ok) return;
    deleteCustomFood(initial.id);
    toast('Alimento borrado');
    onClose();
  };

  const num = (id: string, label: string, value: string, set: (v: string) => void, placeholder?: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Editar alimento' : 'Nuevo alimento'}
      headerExtra={
        editing ? (
          <button className="icon-btn small" aria-label="Borrar alimento" onClick={remove}>
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
      <div className="field">
        <label htmlFor="cf-name">Nombre</label>
        <input id="cf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Yogur proteico, barrita…" autoFocus={!name} />
      </div>
      <div className="field">
        <label htmlFor="cf-brand">Marca (opcional)</label>
        <input id="cf-brand" className="input" value={brand} onChange={(e) => setBrand(e.target.value)} />
      </div>

      <div className="label mt16">Por 100 g (mira la etiqueta)</div>
      <div className="two mt8">
        {num('cf-kcal', 'Calorías (kcal)', kcal, setKcal, p || c || f ? String(fromMacros) : '')}
        {num('cf-p', 'Proteína (g)', protein, setProtein)}
      </div>
      <div className="two mt12">
        {num('cf-c', 'Hidratos (g)', carbs, setCarbs)}
        {num('cf-f', 'Grasa (g)', fat, setFat)}
      </div>
      {!kcal.trim() && (p || c || f) ? <p className="hint">Sin calorías, las calculo con los macros: {fmt0(fromMacros)} kcal.</p> : null}

      <div className="label mt16">Si viene por unidades (opcional)</div>
      <div className="two mt8">
        <div className="field">
          <label htmlFor="cf-un">Unidad</label>
          <input id="cf-un" className="input" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="yogur, barrita…" />
        </div>
        {num('cf-ug', 'Pesa (g)', unitGrams, setUnitGrams, '125')}
      </div>
      <p className="hint">Así puedes escribir «2 yogures» y lo calculo solo.</p>
    </Sheet>
  );
}

/** Lista de alimentos propios. */
export function CustomFoodsSheet({ onClose }: { onClose: () => void }) {
  const state = useApp();
  const [editing, setEditing] = useState<Partial<CustomFood> | null>(null);
  const foods = [...state.customFoods].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return (
    <Sheet
      open
      onClose={onClose}
      title="Mis alimentos"
      footer={
        <button className="btn block secondary" onClick={() => setEditing({})}>
          <Plus size={18} /> Nuevo alimento
        </button>
      }
    >
      {foods.length ? (
        <div className="list flat">
          {foods.map((f) => (
            <button key={f.id} className="row tappable no-lead" onClick={() => setEditing(f)}>
              <div className="body">
                <div className="title">{f.name}</div>
                <div className="meta">
                  <span>{[f.brand, `${fmt0(f.kcal)} kcal/100 g`, f.unitGrams ? `1 ${f.unitName ?? 'unidad'} = ${toInput(f.unitGrams)} g` : ''].filter(Boolean).join(' · ')}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty emoji="🥫" title="Aún no tienes alimentos propios" text="Los productos que busques en el súper o crees a mano se guardan aquí para la próxima vez." />
      )}
      {editing && <CustomFoodSheet initial={editing} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}
