import { useMemo, useState } from 'react';
import { Check, Empty, Sheet, toast } from '../components/ui';
import { WEEKDAY_LETTERS, WEEKDAYS } from '../lib/dates';
import { SHOP_SECTIONS } from '../lib/listInput';
import { menuIngredients, type Ingredient } from '../lib/menuShopping';
import { addListItems, useApp } from '../store/store';
import type { Area } from '../store/types';

/** Lo que lleva el menú de la semana, para pasarlo a la lista de la compra. */
export function MenuShoppingSheet({ area, onClose }: { area: Area; onClose: () => void }) {
  const state = useApp();
  const menu = area.menu ?? { meals: [], days: {} };
  const withMenu = [0, 1, 2, 3, 4, 5, 6].filter((d) => Object.values(menu.days[d] ?? {}).some((t) => t.trim()));
  const [days, setDays] = useState<number[]>(withMenu);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const items = useMemo(() => menuIngredients(menu, days, state.customFoods, state.listItems), [menu, days, state.customFoods, state.listItems]);
  const on = (i: Ingredient) => picked[i.key] ?? (!i.inList && !i.unknown);
  const chosen = items.filter(on);

  const known = items.filter((i) => !i.unknown);
  const unknown = items.filter((i) => i.unknown);
  const groups = SHOP_SECTIONS.map((s) => ({ ...s, items: known.filter((i) => i.section === s.key) })).filter((g) => g.items.length);

  const add = () => {
    if (!chosen.length) return;
    const { repeated } = addListItems(
      'compra',
      chosen.map((i) => ({ text: i.text, qty: i.qty })),
    );
    const added = chosen.length - repeated.length;
    toast(added ? `${added} ${added === 1 ? 'cosa' : 'cosas'} a la lista de la compra` : 'Ya estaba todo en la lista');
    onClose();
  };

  const row = (i: Ingredient) => (
    <div key={i.key} className={`row tappable ${on(i) ? '' : 'done'}`} role="button" tabIndex={0} onClick={() => setPicked({ ...picked, [i.key]: !on(i) })}>
      <div className="lead">
        <Check on={on(i)} onChange={() => setPicked({ ...picked, [i.key]: !on(i) })} square label={on(i) ? `No añadir ${i.text}` : `Añadir ${i.text}`} />
      </div>
      <div className="body">
        <div className="title" style={{ textDecoration: 'none' }}>
          {i.text}
          {i.qty && (
            <span className="badge" style={{ marginLeft: 8, verticalAlign: 2 }}>
              {i.qty}
            </span>
          )}
        </div>
        {i.inList && <div className="meta">Ya está en la lista</div>}
      </div>
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title="Del menú a la compra"
      footer={
        <button className="btn block" disabled={!chosen.length} onClick={add}>
          {chosen.length ? `Añadir ${chosen.length} a la compra` : 'Marca lo que haga falta'}
        </button>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Lo que lleva el menú de los días marcados, sumado. Quita lo que ya tengas en casa.
      </p>
      <div className="week-strip" style={{ marginBottom: 14 }}>
        {WEEKDAY_LETTERS.map((l, d) => {
          const has = withMenu.includes(d);
          const sel = days.includes(d);
          return (
            <button
              key={l}
              className={`day-pill ${sel ? 'on' : ''}`}
              disabled={!has}
              style={has ? undefined : { opacity: 0.35 }}
              onClick={() => setDays(sel ? days.filter((x) => x !== d) : [...days, d].sort())}
              aria-pressed={sel}
              aria-label={WEEKDAYS[d]}
            >
              <span className="n" style={{ fontSize: 'calc(16px * var(--fs))' }}>
                {l}
              </span>
            </button>
          );
        })}
      </div>

      {!withMenu.length && <Empty emoji="🍽️" title="El menú está vacío" text="Escribe o importa el menú de la semana y luego pásalo aquí a la compra." />}
      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 12 }}>
          <div className="day-head" style={{ margin: '4px 4px 8px' }}>
            {g.label}
          </div>
          <div className="list flat">{g.items.map(row)}</div>
        </div>
      ))}
      {unknown.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="day-head" style={{ margin: '4px 4px 8px' }}>
            Más cosas del menú (márcalas si hacen falta)
          </div>
          <div className="list flat">{unknown.map(row)}</div>
        </div>
      )}
    </Sheet>
  );
}
