import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Rutas con # (funcionan en cualquier alojamiento estático) y hojas/diálogos
 * que se cierran con el botón "atrás" de Android.
 */

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string = location.hash): Route {
  const raw = hash.replace(/^#/, '') || '/hoy';
  const [path, qs] = raw.split('?');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return { path: clean, parts: clean.split('/').filter(Boolean), query: new URLSearchParams(qs ?? '') };
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => '');
  return parseHash(hash);
}

interface Overlay {
  id: number;
  close: () => void;
}

/*
 * Mientras haya hojas abiertas hay UNA entrada "guarda" en el historial: el
 * botón atrás la consume y cierra la hoja de arriba. Abrir una hoja dentro de
 * otra, o cambiar una por otra, no toca el historial (así no se desincroniza).
 */
const overlays: Overlay[] = [];
let seq = 0;
let guard = false;
let ignorePops = 0;
let pendingNav: (() => void) | null = null;

function pushGuard() {
  history.pushState({ overlay: true }, '', location.href);
  guard = true;
}

function dropGuard(then?: () => void) {
  guard = false;
  ignorePops++;
  if (then) {
    const prev = pendingNav;
    pendingNav = () => {
      prev?.();
      then();
    };
  }
  history.back();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      // Es nuestro propio "atrás" para quitar la guarda.
      ignorePops--;
      if (ignorePops === 0) {
        const fn = pendingNav;
        pendingNav = null;
        fn?.();
        if (overlays.length && !guard) pushGuard();
      }
      return;
    }
    if (!overlays.length) return; // navegación normal entre pantallas
    guard = false;
    const top = overlays.pop();
    top?.close();
    if (overlays.length) pushGuard();
  });
}

function pushOverlay(close: () => void): number {
  const id = ++seq;
  overlays.push({ id, close });
  if (!guard && ignorePops === 0) pushGuard();
  return id;
}

function popOverlay(id: number) {
  const i = overlays.findIndex((o) => o.id === id);
  if (i === -1) return; // ya se cerró con "atrás"
  overlays.splice(i, 1);
  // Se espera un momento por si se abre otra hoja en su lugar.
  setTimeout(() => {
    if (!overlays.length && guard) dropGuard();
  }, 0);
}

/** Mientras `open` sea true, el botón atrás cierra en vez de navegar. */
export function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = pushOverlay(() => ref.current());
    return () => popOverlay(id);
  }, [open]);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = to.startsWith('#') ? to : `#${to}`;
  const go = () => {
    if (opts.replace) history.replaceState(null, '', location.pathname + location.search + target);
    else if (location.hash !== target) location.hash = target;
    if (opts.replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  if (overlays.length) {
    // Primero se cierran las hojas abiertas.
    const closing = overlays.splice(0);
    closing.reverse().forEach((o) => o.close());
  }
  if (guard) {
    // Quitamos la guarda del historial y luego navegamos.
    dropGuard(go);
  } else if (ignorePops > 0) {
    // Hay un "atrás" en curso: navegamos cuando termine.
    const prev = pendingNav;
    pendingNav = () => {
      prev?.();
      go();
    };
  } else go();
}

/** Quita parámetros de la ruta actual sin añadir historial. */
export function clearQuery(...keys: string[]) {
  const r = parseHash();
  let changed = false;
  for (const k of keys) {
    if (r.query.has(k)) {
      r.query.delete(k);
      changed = true;
    }
  }
  if (!changed) return;
  const qs = r.query.toString();
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${r.path}${qs ? `?${qs}` : ''}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
