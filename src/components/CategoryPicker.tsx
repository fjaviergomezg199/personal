import { Plus } from 'lucide-react';
import { useState } from 'react';
import { COLORS, COLOR_KEYS } from '../lib/colors';
import { sortedCategories } from '../store/selectors';
import { addCategory, useApp } from '../store/store';
import type { Category, ColorKey, ID } from '../store/types';

/** El primer color que no usa ninguna categoría (así cada una sale distinta). */
export function nextColor(cats: Pick<Category, 'color'>[]): ColorKey {
  const used = new Set(cats.map((c) => c.color));
  return COLOR_KEYS.find((c) => !used.has(c)) ?? COLOR_KEYS[cats.length % COLOR_KEYS.length];
}

export function ColorDots({ value, onChange }: { value: ColorKey; onChange: (c: ColorKey) => void }) {
  return (
    <div className="color-row" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={value === c.key}
          className={`color-dot tone-${c.key} ${value === c.key ? 'on' : ''}`}
          onClick={() => onChange(c.key)}
          aria-label={c.label}
        />
      ))}
    </div>
  );
}

/** Formulario corto para crear una categoría: nombre y color. */
export function NewCategory({ initialName = '', onCreated, onCancel }: { initialName?: string; onCreated: (id: ID) => void; onCancel: () => void }) {
  const state = useApp();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<ColorKey>(() => nextColor(state.categories));
  const create = () => {
    if (!name.trim()) return;
    onCreated(addCategory(name, color));
  };
  return (
    <div className={`cat-new tone-${color}`}>
      <input
        className="input"
        autoFocus
        value={name}
        maxLength={40}
        placeholder="Nombre: 2Sigma, Running, Casa…"
        aria-label="Nombre de la categoría"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            create();
          }
        }}
      />
      <ColorDots value={color} onChange={setColor} />
      <div className="btn-row">
        <button type="button" className="btn small" disabled={!name.trim()} onClick={create}>
          Crear
        </button>
        <button type="button" className="btn small secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Elegir la categoría al guardar (o crear una nueva ahí mismo). `pending` es una
 * nueva que aún no existe (la de un «#running» escrito): se crea al guardar.
 */
export function CategoryPicker(props: {
  value?: ID;
  onChange: (id: ID | undefined) => void;
  pending?: { name: string; color: ColorKey } | null;
  onDropPending?: () => void;
}) {
  const state = useApp();
  const cats = sortedCategories(state);
  const [creating, setCreating] = useState(false);
  return (
    <div className="field">
      <span className="label">Categoría</span>
      <div className="chips" role="radiogroup" aria-label="Categoría">
        {props.pending && (
          <button type="button" role="radio" aria-checked className={`chip cat-chip sel new tone-${props.pending.color}`} onClick={props.onDropPending}>
            <i aria-hidden />
            {props.pending.name} <span className="tiny">(nueva)</span>
          </button>
        )}
        {cats.map((c) => {
          const on = !props.pending && props.value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`chip cat-chip tone-${c.color} ${on ? 'sel' : ''}`}
              onClick={() => props.onChange(on ? undefined : c.id)}
            >
              <i aria-hidden />
              {c.emoji ? `${c.emoji} ` : ''}
              {c.name}
            </button>
          );
        })}
        {!creating && (
          <button type="button" className="chip" onClick={() => setCreating(true)}>
            <Plus size={15} /> Nueva
          </button>
        )}
      </div>
      {creating && (
        <NewCategory
          onCreated={(id) => {
            props.onChange(id);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {!cats.length && !creating && !props.pending && <p className="hint">Crea categorías (trabajo, deporte…) y cada cosa saldrá de su color. Al escribir, «#running» la pone sola.</p>}
    </div>
  );
}
