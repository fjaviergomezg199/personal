import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EntryRow } from '../components/AgendaRow';
import { confirmDialog, Empty, toast } from '../components/ui';
import { todayISO } from '../lib/dates';
import { parseQuick } from '../lib/quickParse';
import { areaTasks } from '../store/selectors';
import { addEntry, getState, update, useApp } from '../store/store';
import { moduleLabel } from '../store/templates';
import type { Area, Entry } from '../store/types';

function sortTasks(list: Entry[]): Entry[] {
  return [...list].sort((a, b) => {
    if (!!a.important !== !!b.important) return a.important ? -1 : 1;
    if (a.date && b.date) return (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''));
    if (a.date) return -1;
    if (b.date) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function TasksModule({ area }: { area: Area }) {
  const state = useApp();
  const today = todayISO();
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const label = moduleLabel(area, 'tasks');
  const isShopping = area.template === 'nutrition';

  const all = useMemo(() => areaTasks(state, area.id), [state, area.id]);
  const pending = sortTasks(all.filter((e) => !e.done || e.repeat !== 'none'));
  const done = all.filter((e) => e.done && e.repeat === 'none').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (isShopping) {
      // En la lista de la compra no interpretamos fechas.
      addEntry({ kind: 'task', title: t.charAt(0).toUpperCase() + t.slice(1), repeat: 'none', alert: null, areaId: area.id });
    } else {
      const p = parseQuick(t);
      addEntry({
        kind: p.time ? 'reminder' : 'task',
        title: p.title || t,
        date: p.date,
        time: p.time,
        repeat: p.repeat,
        alert: p.time ? (p.alert ?? getState().settings.defaultAlert) : null,
        areaId: area.id,
      });
    }
    setText('');
  };

  const clearDone = async () => {
    const ok = await confirmDialog({ title: `¿Quitar ${done.length} hechas?`, confirm: 'Quitar', danger: true });
    if (!ok) return;
    const ids = new Set(done.map((d) => d.id));
    update((s) => {
      for (const e of s.entries) if (ids.has(e.id) && e.google) s.googleDeletes.push(e.google);
      s.entries = s.entries.filter((e) => !ids.has(e.id));
    });
    toast('Hechas eliminadas');
  };

  return (
    <div>
      <form
        className="hstack"
        style={{ marginBottom: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input grow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isShopping ? 'Añadir a la compra…' : 'Nuevo pendiente… «entregar trabajo el 15/11»'}
          enterKeyHint="done"
        />
        <button className="icon-btn primary" type="submit" aria-label="Añadir" style={{ width: 48, height: 48 }} disabled={!text.trim()}>
          <Plus size={22} />
        </button>
      </form>

      {pending.length ? (
        <div className="list">
          {pending.map((e) => (
            <EntryRow key={e.id} entry={e} date={e.repeat !== 'none' ? today : e.date} showDate={!!e.date} overdue={!!e.date && e.date < today} />
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty
            emoji={isShopping ? '🛒' : '✨'}
            title={isShopping ? 'La lista de la compra está vacía' : `Nada en ${label.toLowerCase()}`}
            text={isShopping ? 'Escribe arriba lo que necesitas comprar.' : 'Escribe arriba. Si pones una fecha («el viernes»), aparecerá también en tu agenda.'}
          />
        </div>
      )}

      {done.length > 0 && (
        <div className="mt16">
          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <button className="link-btn" onClick={() => setShowDone(!showDone)}>
              {showDone ? 'Ocultar' : 'Ver'} hechas ({done.length})
            </button>
            {showDone && (
              <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={clearDone}>
                Quitar hechas
              </button>
            )}
          </div>
          {showDone && (
            <div className="list mt8">
              {done.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
