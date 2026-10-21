import { Check as CheckIcon, X } from 'lucide-react';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '../lib/router';

/* ---------------- Hoja inferior ---------------- */

export function Sheet(props: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  headerExtra?: ReactNode;
  className?: string;
}) {
  const { open, onClose } = props;
  useOverlay(open, onClose);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${props.full ? 'full' : ''} ${props.className ?? ''}`} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h3>{props.title}</h3>
          {props.headerExtra}
          <button className="icon-btn small" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
        {props.footer && <div className="sheet-foot">{props.footer}</div>}
      </div>
    </>,
    document.body,
  );
}

/* ---------------- Avisos (toasts) ---------------- */

interface ToastItem {
  id: number;
  message: string;
  action?: string;
  onAction?: () => void;
}

let toasts: ToastItem[] = [];
let toastSeq = 0;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

export function toast(message: string, opts: { action?: string; onAction?: () => void; duration?: number } = {}) {
  const id = ++toastSeq;
  toasts = [{ id, message, action: opts.action, onAction: opts.onAction }]; // uno cada vez: «Deshacer» siempre es lo último
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, opts.duration ?? (opts.action ? 6000 : 2800));
}

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
  );
  if (!list.length) return null;
  return createPortal(
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div className="toast" key={t.id}>
          <span className="grow">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.onAction?.();
                toasts = toasts.filter((x) => x.id !== t.id);
                emitToasts();
              }}
            >
              {t.action}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ---------------- Confirmación ---------------- */

interface ConfirmState {
  title: string;
  message?: string;
  confirm: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let confirmState: ConfirmState | null = null;
const confirmListeners = new Set<() => void>();

export function confirmDialog(opts: { title: string; message?: string; confirm?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = { ...opts, confirm: opts.confirm ?? 'Aceptar', resolve };
    confirmListeners.forEach((l) => l());
  });
}

export function ConfirmHost() {
  const st = useSyncExternalStore(
    (cb) => {
      confirmListeners.add(cb);
      return () => confirmListeners.delete(cb);
    },
    () => confirmState,
  );
  const close = (ok: boolean) => {
    st?.resolve(ok);
    confirmState = null;
    confirmListeners.forEach((l) => l());
  };
  useOverlay(!!st, () => close(false));
  if (!st) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" style={{ zIndex: 89 }} onClick={() => close(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true">
        <h3>{st.title}</h3>
        {st.message && <p>{st.message}</p>}
        <div className="btn-row">
          <button className="btn secondary" onClick={() => close(false)}>
            Cancelar
          </button>
          <button className={`btn ${st.danger ? 'danger' : ''}`} onClick={() => close(true)} autoFocus>
            {st.confirm}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/* ---------------- Controles ---------------- */

export function Check(props: { on: boolean; onChange: () => void; label?: string; square?: boolean }) {
  return (
    <button
      type="button"
      className={`check ${props.on ? 'on' : ''} ${props.square ? 'square' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!props.on && navigator.vibrate) navigator.vibrate(8);
        props.onChange();
      }}
      aria-pressed={props.on}
      aria-label={props.label ?? (props.on ? 'Marcar como pendiente' : 'Marcar como hecho')}
    >
      <CheckIcon size={16} strokeWidth={3.2} />
    </button>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch-row">
      <div className="grow">
        <div className="t">{props.label}</div>
        {props.description && <div className="d">{props.description}</div>}
      </div>
      <span className="switch">
        <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {props.options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === props.value} className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty(props: { emoji: string; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="e">{props.emoji}</div>
      <div className="t">{props.title}</div>
      {props.text && <p>{props.text}</p>}
      {props.action}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SectionHead(props: { title: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>
        {props.title}
        {props.count !== undefined && props.count > 0 && <span className="count">{props.count}</span>}
      </h2>
      {props.action}
    </div>
  );
}
