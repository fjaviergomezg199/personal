import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ColorDots, nextColor } from '../components/CategoryPicker';
import { confirmDialog, Sheet, toast } from '../components/ui';
import { EMOJI_CHOICES } from '../lib/colors';
import { addCategory, deleteCategory, findCategory, restoreCategory, updateCategory, useApp } from '../store/store';
import type { Category, ColorKey } from '../store/types';

/** Crear o cambiar una categoría: nombre, color y (si se quiere) un emoji. */
export function CategorySheet({ category, onClose }: { category?: Category; onClose: () => void }) {
  const state = useApp();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState<ColorKey>(category?.color ?? nextColor(state.categories));
  const [emoji, setEmoji] = useState(category?.emoji ?? '');
  const clash = name.trim() ? findCategory(state, name) : undefined;
  const taken = !!clash && clash.id !== category?.id;
  const count = category ? state.entries.filter((e) => e.categoryId === category.id).length : 0;

  const save = () => {
    if (!name.trim() || taken) return;
    if (category) updateCategory(category.id, { name, color, emoji: emoji || undefined });
    else addCategory(name, color, emoji || undefined);
    onClose();
  };

  const remove = async () => {
    if (!category) return;
    const ok = await confirmDialog({
      title: `¿Borrar «${category.name}»?`,
      message: count ? `Lo que tiene (${count}) se queda en el calendario, sin categoría.` : undefined,
      confirm: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    const undo = deleteCategory(category.id);
    onClose();
    toast('Categoría borrada', { action: 'Deshacer', onAction: () => undo.category && restoreCategory(undo.category, undo.entryIds) });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? 'Categoría' : 'Nueva categoría'}
      headerExtra={
        category && (
          <button className="icon-btn small" aria-label="Borrar categoría" onClick={remove}>
            <Trash2 size={17} />
          </button>
        )
      }
      footer={
        <button className="btn block" disabled={!name.trim() || taken} onClick={save}>
          {category ? 'Guardar' : 'Crear'}
        </button>
      }
    >
      <div className={`cat-preview tone-${color}`}>
        <span className="mchip">
          {emoji ? `${emoji} ` : ''}
          {name.trim() || 'Así se verá'}
        </span>
      </div>
      <div className="field">
        <label htmlFor="cat-name">Nombre</label>
        <input id="cat-name" className="input" value={name} maxLength={40} autoFocus={!category} placeholder="2Sigma, Running, Casa…" onChange={(e) => setName(e.target.value)} />
        {taken && <p className="hint">Ya tienes una categoría que se llama así.</p>}
      </div>
      <div className="field">
        <span className="label">Color</span>
        <ColorDots value={color} onChange={setColor} />
      </div>
      <div className="field">
        <span className="label">Emoji (opcional)</span>
        <div className="emoji-grid">
          <button type="button" className={!emoji ? 'on' : ''} onClick={() => setEmoji('')} aria-label="Sin emoji">
            —
          </button>
          {EMOJI_CHOICES.map((e) => (
            <button key={e} type="button" className={emoji === e ? 'on' : ''} onClick={() => setEmoji(e)} aria-label={`Emoji ${e}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
      {category && <p className="hint">{count ? `${count} ${count === 1 ? 'cosa' : 'cosas'} en el calendario con esta categoría.` : 'Aún no tiene nada.'}</p>}
    </Sheet>
  );
}
