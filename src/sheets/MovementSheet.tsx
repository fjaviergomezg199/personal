import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Segmented, Sheet, toast } from '../components/ui';
import { addDays, formatDayMonth, todayISO } from '../lib/dates';
import { categoriesFor, categoryOf, currentPeriod, eur, guessCategory, parseAmount, withStart } from '../lib/finance';
import { addMovement, deleteMovement, getState, restoreMovement, updateFinAccount, updateMovement, useApp } from '../store/store';
import type { FinKind, FinScope, Movement } from '../store/types';

export const SCOPE_LABEL: Record<FinScope, string> = { personal: 'Mía', hogar: 'Conjunta' };

/** Apuntar (o cambiar) un gasto o un ingreso. */
export function MovementSheet(props: { scope: FinScope; kind?: FinKind; movement?: Movement; onClose: () => void }) {
  const { movement, onClose } = props;
  const state = useApp();
  const today = todayISO();
  const [kind, setKind] = useState<FinKind>(movement?.kind ?? props.kind ?? 'gasto');
  const [amount, setAmount] = useState(movement ? String(movement.amount).replace('.', ',') : '');
  const [note, setNote] = useState(movement?.note ?? '');
  const [category, setCategory] = useState<string | null>(movement?.category ?? null);
  const [date, setDate] = useState(movement?.date ?? today);
  const [scope, setScope] = useState<FinScope>(movement?.scope ?? props.scope);

  const value = parseAmount(amount);
  const guessed = guessCategory(note, kind);
  const cat = category ?? guessed ?? (kind === 'gasto' ? 'otros' : 'otros-ingresos');
  const valid = value !== null && value > 0;

  // Conceptos recientes (los que más se repiten primero)
  const recents = useMemo(() => {
    const count = new Map<string, { note: string; category: string; n: number }>();
    for (const m of state.finance.movements) {
      if (m.deleted || m.kind !== kind || !m.note || m.recurringId) continue;
      const k = m.note.trim().toLowerCase();
      const cur = count.get(k);
      count.set(k, { note: m.note.trim(), category: m.category, n: (cur?.n ?? 0) + 1 });
    }
    return [...count.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  }, [state.finance.movements, kind]);

  const changeKind = (k: FinKind) => {
    setKind(k);
    if (category && categoryOf(category).kind !== k) setCategory(null);
  };

  const save = () => {
    if (!valid) return;
    const data = { scope, kind, date, amount: value!, category: cat, note: note.trim() || undefined };
    if (movement) {
      updateMovement(movement.id, data);
      onClose();
      return;
    }
    const id = addMovement(data);
    onClose();
    // ¿Es la nómina? Puede que toque empezar el periodo nuevo.
    const acc = getState().finance.accounts[scope];
    const p = currentPeriod(acc, today);
    const looksLikePay = kind === 'ingreso' && cat === 'nomina' && acc.periodStarts.length > 0 && !p.end && date > p.start && date >= addDays(p.estimatedEnd, -6);
    if (looksLikePay) {
      toast(`Nómina apuntada. ¿Empieza hoy el periodo nuevo?`, {
        action: `Sí, desde el ${formatDayMonth(date, today)}`,
        onAction: () => updateFinAccount(scope, 'periods', { periodStarts: withStart(getState().finance.accounts[scope].periodStarts, date) }),
        duration: 9000,
      });
    } else {
      toast(`${kind === 'gasto' ? 'Gasto' : 'Ingreso'} apuntado · ${eur(value!)}`, { action: 'Deshacer', onAction: () => deleteMovement(id) });
    }
  };

  const remove = () => {
    if (!movement) return;
    deleteMovement(movement.id);
    onClose();
    toast('Borrado', { action: 'Deshacer', onAction: () => restoreMovement(movement) });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title={movement ? 'Editar' : kind === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso'}
      headerExtra={
        movement ? (
          <button className="icon-btn small" aria-label="Borrar" onClick={remove}>
            <Trash2 size={16} />
          </button>
        ) : undefined
      }
      footer={
        <button className="btn block" disabled={!valid} onClick={save}>
          {valid ? `Guardar · ${eur(value!)}` : 'Escribe el importe'}
        </button>
      }
    >
      <Segmented
        value={kind}
        onChange={changeKind}
        options={[
          { value: 'gasto', label: 'Gasto' },
          { value: 'ingreso', label: 'Ingreso' },
        ]}
      />

      <label className="amount-input mt16">
        <span className="sr-only">Importe en euros</span>
        <input
          inputMode="decimal"
          autoFocus={!movement}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <span>€</span>
      </label>

      <div className="field mt16">
        <label htmlFor="mv-note">Concepto (opcional)</label>
        <input id="mv-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'gasto' ? 'Mercadona, gasolina, cena…' : 'Nómina, bizum…'} />
      </div>
      {recents.length > 0 && !note && (
        <div className="chips mt8">
          {recents.map((r) => (
            <button
              key={r.note}
              className="chip mini"
              onClick={() => {
                setNote(r.note);
                setCategory(r.category);
              }}
            >
              {categoryOf(r.category).emoji} {r.note}
            </button>
          ))}
        </div>
      )}

      <div className="field mt16">
        <span className="label">Categoría{!category && guessed ? ' (la he adivinado por el concepto)' : ''}</span>
        <div className="cat-grid">
          {categoriesFor(kind).map((c) => (
            <button key={c.key} className={`cat-chip ${cat === c.key ? 'on' : ''}`} onClick={() => setCategory(c.key)} aria-pressed={cat === c.key}>
              <span className="e" aria-hidden>
                {c.emoji}
              </span>
              <span className="l">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field mt16">
        <span className="label">Día</span>
        <div className="hstack wrap">
          <button className={`chip ${date === today ? 'on' : ''}`} onClick={() => setDate(today)}>
            Hoy
          </button>
          <button className={`chip ${date === addDays(today, -1) ? 'on' : ''}`} onClick={() => setDate(addDays(today, -1))}>
            Ayer
          </button>
          <input className="input grow" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Otro día" style={{ minWidth: 150 }} />
        </div>
      </div>

      <div className="field mt16">
        <span className="label">Cuenta</span>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'personal', label: '💶 Mía' },
            { value: 'hogar', label: '🤝 Conjunta' },
          ]}
        />
      </div>
    </Sheet>
  );
}
