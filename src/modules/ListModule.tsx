import { Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Check, confirmDialog, Empty, Sheet, toast } from '../components/ui';
import { parseListInput, SHOP_SECTIONS, shopSection } from '../lib/listInput';
import { syncShare, useShareSyncing } from '../lib/shareSync';
import { addListItems, deleteListItems, restoreListItems, updateListItem, useApp } from '../store/store';
import type { Area, ListItem, ListKey } from '../store/types';
import { HomeShareSheet } from '../sheets/HomeShareSheet';

const COPY: Record<ListKey, { placeholder: string; done: string; clear: string; empty: string; emptyText: string; emoji: string }> = {
  compra: {
    placeholder: 'Añadir… «leche x2, 1 kg naranjas, pan»',
    done: 'En el carro',
    clear: 'Vaciar lo comprado',
    empty: 'La lista de la compra está vacía',
    emptyText: 'Escribe arriba lo que haga falta, separado por comas. Se ordena solo por secciones del súper.',
    emoji: '🛒',
  },
  casa: {
    placeholder: 'Añadir tarea… «poner lavadora, regar plantas»',
    done: 'Hecho',
    clear: 'Quitar lo hecho',
    empty: 'Nada pendiente en casa',
    emptyText: 'Apunta aquí las tareas de casa. Si compartís el hogar, las veréis los dos.',
    emoji: '🧹',
  },
};

export function ListModule({ area, list }: { area: Area; list: ListKey }) {
  const state = useApp();
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [sharing, setSharing] = useState(false);
  const copy = COPY[list];
  const me = state.settings.name.trim();

  const items = useMemo(() => state.listItems.filter((i) => i.list === list && !i.deleted), [state.listItems, list]);
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const groups = useMemo(() => {
    if (list !== 'compra') return [{ key: 'all', label: '', items: pending }];
    const by = new Map<string, ListItem[]>();
    for (const it of pending) {
      const k = shopSection(it.text);
      by.set(k, [...(by.get(k) ?? []), it]);
    }
    return SHOP_SECTIONS.filter((s) => by.has(s.key)).map((s) => ({ ...s, items: by.get(s.key)! }));
  }, [pending, list]);

  const add = () => {
    const parsed = parseListInput(text);
    if (!parsed.length) return;
    const { repeated } = addListItems(list, parsed);
    setText('');
    if (repeated.length) toast(`${repeated.join(', ')}: ya estaba en la lista`);
  };

  const clearDone = async () => {
    const ok = await confirmDialog({ title: `¿${copy.clear}?`, message: `Se quitarán ${done.length} de la lista.`, confirm: 'Quitar' });
    if (!ok) return;
    const ids = done.map((d) => d.id);
    deleteListItems(ids);
    toast('Lista limpia', { action: 'Deshacer', onAction: () => restoreListItems(ids) });
  };

  const row = (it: ListItem) => (
    <div
      key={it.id}
      className={`row tappable ${it.done ? 'done' : ''} tone-${area.color}`}
      role="button"
      tabIndex={0}
      onClick={() => updateListItem(it.id, { done: !it.done })}
    >
      <div className="lead">
        <Check on={it.done} onChange={() => updateListItem(it.id, { done: !it.done })} />
      </div>
      <div className="body">
        <div className="title">
          {it.text}
          {it.qty && (
            <span className="badge" style={{ marginLeft: 8, verticalAlign: 2 }}>
              {it.qty}
            </span>
          )}
        </div>
        {it.by && it.by !== me && (
          <div className="meta">
            <span>{it.done ? `${it.by} lo marcó` : `Lo añadió ${it.by}`}</span>
          </div>
        )}
      </div>
      <button
        className="icon-btn small plain"
        aria-label="Editar"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(it);
        }}
      >
        <Pencil size={15} />
      </button>
    </div>
  );

  return (
    <div>
      <ShareStatus onSetup={() => setSharing(true)} />

      <form
        className="hstack"
        style={{ margin: '14px 0' }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.placeholder} enterKeyHint="done" />
        <button className="icon-btn primary" type="submit" aria-label="Añadir" style={{ width: 48, height: 48 }} disabled={!text.trim()}>
          <Plus size={22} />
        </button>
      </form>

      {pending.length ? (
        groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 12 }}>
            {g.label && <div className="day-head" style={{ margin: '4px 4px 8px' }}>{g.label}</div>}
            <div className="list">{g.items.map(row)}</div>
          </div>
        ))
      ) : (
        <div className="card">
          <Empty emoji={copy.emoji} title={copy.empty} text={copy.emptyText} />
        </div>
      )}

      {done.length > 0 && (
        <div className="mt16">
          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <button className="link-btn" onClick={() => setShowDone(!showDone)}>
              {showDone ? 'Ocultar' : 'Ver'} {copy.done.toLowerCase()} ({done.length})
            </button>
            <button className="link-btn" onClick={clearDone}>
              {copy.clear}
            </button>
          </div>
          {showDone && <div className="list mt8">{done.map(row)}</div>}
        </div>
      )}

      {editing && <EditItemSheet item={editing} onClose={() => setEditing(null)} />}
      {sharing && <HomeShareSheet onClose={() => setSharing(false)} />}
    </div>
  );
}

function ShareStatus({ onSetup }: { onSetup: () => void }) {
  const state = useApp();
  const syncing = useShareSyncing();
  const share = state.share;
  if (!share) {
    return (
      <button className="card hstack" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={onSetup}>
        <Users size={22} color="var(--primary)" />
        <div className="grow">
          <div style={{ fontWeight: 700 }}>Compartir con tu pareja</div>
          <div className="small muted">Misma lista en los dos móviles: lo que uno apunta, el otro lo ve.</div>
        </div>
      </button>
    );
  }
  const ago = share.lastSync ? Math.round((Date.now() - share.lastSync) / 60000) : null;
  return (
    <div className={`card hstack ${share.error ? 'tone-amber' : ''}`} style={share.error ? { background: 'var(--warning-soft)' } : undefined}>
      <Users size={20} color={share.error ? 'var(--warning)' : 'var(--success)'} />
      <div className="grow small" role="button" tabIndex={0} onClick={onSetup}>
        <b>{share.name} compartido</b>
        <div className="muted">
          {share.error ?? (ago === null ? 'Conectando…' : ago < 1 ? 'Al día' : `Actualizado hace ${ago} min`)}
        </div>
      </div>
      <button className="icon-btn small" aria-label="Actualizar" disabled={syncing} onClick={() => void syncShare()}>
        <RefreshCw size={16} className={syncing ? 'spin' : ''} />
      </button>
    </div>
  );
}

function EditItemSheet({ item, onClose }: { item: ListItem; onClose: () => void }) {
  const [text, setText] = useState(item.text);
  const [qty, setQty] = useState(item.qty ?? '');
  const save = () => {
    if (!text.trim()) return;
    updateListItem(item.id, { text: text.trim(), qty: qty.trim() || undefined });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Editar"
      headerExtra={
        <button
          className="icon-btn small"
          aria-label="Borrar"
          onClick={() => {
            deleteListItems([item.id]);
            onClose();
            toast('Borrado', { action: 'Deshacer', onAction: () => restoreListItems([item.id]) });
          }}
        >
          <Trash2 size={16} />
        </button>
      }
      footer={
        <button className="btn block" onClick={save} disabled={!text.trim()}>
          Guardar
        </button>
      }
    >
      <div className="field">
        <label htmlFor="li-text">Qué</label>
        <input id="li-text" className="input" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {item.list === 'compra' && (
        <div className="field">
          <label htmlFor="li-qty">Cantidad (opcional)</label>
          <input id="li-qty" className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2, 1 kg, 6 latas…" />
        </div>
      )}
    </Sheet>
  );
}
