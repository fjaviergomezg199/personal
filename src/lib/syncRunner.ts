import { useSyncExternalStore } from 'react';
import { toast } from '../components/ui';
import { getState } from '../store/store';
import { beginGoogleAuth, canAutoAuth, hasValidToken, recordAutoAuth, resetAutoAuth, type RedirectResult } from './google';
import { pendingGoogleChanges, syncGoogle } from './sync';

/** Orquesta la sincronización con Google y su estado para la interfaz. */

export interface SyncStatus {
  running: boolean;
  needsAuth: boolean;
  error?: string;
}

let status: SyncStatus = { running: false, needsAuth: false };
const listeners = new Set<() => void>();

function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

export function googleConfigured(): boolean {
  const g = getState().settings.google;
  return !!g.clientId?.trim();
}

/** Conectado alguna vez (tenemos su correo). */
export function googleLinked(): boolean {
  const g = getState().settings.google;
  return googleConfigured() && !!g.email;
}

export function connectGoogle(opts: { silentFirst?: boolean } = {}) {
  const g = getState().settings.google;
  if (!g.clientId) return;
  resetAutoAuth();
  if (opts.silentFirst && g.email) beginGoogleAuth(g.clientId, { silent: true, email: g.email, fallback: true });
  else beginGoogleAuth(g.clientId, { email: g.email });
}

export async function runSync(opts: { manual?: boolean } = {}) {
  if (!googleConfigured()) return;
  if (!hasValidToken()) {
    set({ needsAuth: true });
    if (opts.manual) connectGoogle({ silentFirst: true });
    return;
  }
  set({ running: true });
  const r = await syncGoogle();
  if (r.status === 'ok') {
    set({ running: false, needsAuth: false, error: r.errors[0] });
    if (opts.manual) toast(r.errors.length ? `Sincronizado con ${r.errors.length} aviso(s): ${r.errors[0]}` : 'Google Calendar al día ✓');
  } else if (r.status === 'needs-auth') {
    set({ running: false, needsAuth: true });
    if (opts.manual) connectGoogle({ silentFirst: true });
  } else if (r.status === 'offline') {
    set({ running: false });
    if (opts.manual) toast('Sin conexión. Se enviará cuando vuelvas a tener internet.');
  } else set({ running: false });
}

export function handleRedirectResult(r: RedirectResult) {
  const g = getState().settings.google;
  if (r.status === 'ok') {
    resetAutoAuth();
    set({ needsAuth: false });
    void runSync().then(() => {
      if (!status.error) toast('Conectado con Google Calendar ✓');
    });
    return;
  }
  if (r.silent && r.fallback && g.clientId) {
    // Lo pidió la persona: si la renovación silenciosa falla, mostramos Google.
    beginGoogleAuth(g.clientId, { email: r.email });
    return;
  }
  if (r.silent) {
    recordAutoAuth(true);
    set({ needsAuth: true });
    return;
  }
  set({ needsAuth: true });
  const msg: Record<string, string> = {
    access_denied: 'Has cancelado el permiso de Google.',
    state_mismatch: 'La conexión con Google no se pudo verificar. Inténtalo de nuevo.',
  };
  toast(msg[r.error] ?? `No se pudo conectar con Google (${r.error}). Revisa el ID de cliente en Ajustes.`, { duration: 7000 });
}

/** Renueva el permiso (rebote rápido a Google) solo si hay algo que enviar. */
export function maybeAutoReconnect(): boolean {
  const g = getState().settings.google;
  if (!googleLinked() || !g.autoReconnect || hasValidToken()) return false;
  if (pendingGoogleChanges() === 0 || !canAutoAuth()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (document.visibilityState !== 'visible') return false;
  recordAutoAuth(false);
  beginGoogleAuth(g.clientId, { silent: true, email: g.email });
  return true;
}
