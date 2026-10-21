import { useSyncExternalStore } from 'react';
import { toast } from '../components/ui';
import { getState } from '../store/store';
import { backupToDrive, driveBackupDue, driveBackupOverdue, setDriveRestoreOpen } from './driveBackup';
import { beginGoogleAuth, canAutoAuth, DRIVE_SCOPE, hasScope, hasValidToken, recordAutoAuth, resetAutoAuth, type AfterAuth, type RedirectResult } from './google';
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

/** Con la copia en Drive activada, el permiso de Google incluye Drive. */
const wantsDrive = () => !!getState().settings.drive?.on;

export function connectGoogle(opts: { silentFirst?: boolean; then?: AfterAuth } = {}) {
  const g = getState().settings.google;
  if (!g.clientId) return;
  resetAutoAuth();
  const drive = wantsDrive() || !!opts.then;
  if (opts.silentFirst && g.email) beginGoogleAuth(g.clientId, { silent: true, email: g.email, fallback: true, drive, then: opts.then });
  else beginGoogleAuth(g.clientId, { email: g.email, drive, then: opts.then });
}

/** Copia en Drive. A mano (`manual`) se hace aunque no haya cambios y se avisa de cómo ha ido. */
export async function runDriveBackup(opts: { manual?: boolean } = {}) {
  if (!opts.manual && !driveBackupDue()) return;
  if (!hasScope(DRIVE_SCOPE)) {
    if (opts.manual) connectGoogle({ silentFirst: true, then: 'drive-backup' });
    return;
  }
  const r = await backupToDrive({ force: opts.manual });
  if (!opts.manual) return;
  if (r.status === 'ok') toast(`Copia guardada en tu Google Drive ✓${r.uploaded ? ` (y ${r.uploaded === 1 ? '1 archivo' : `${r.uploaded} archivos`})` : ''}`);
  else if (r.status === 'needs-auth') connectGoogle({ then: 'drive-backup' });
  else if (r.status === 'offline') toast('Sin conexión: la copia se hará cuando vuelva internet.');
  else if (r.status === 'error') toast(r.message, { duration: 7000 });
}

/** Elegir una copia de Drive para recuperarla (pidiendo antes el permiso si hace falta). */
export function startDriveRestore() {
  if (hasScope(DRIVE_SCOPE)) setDriveRestoreOpen(true);
  else connectGoogle({ silentFirst: true, then: 'drive-restore' });
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
    if (r.then === 'drive-restore') setDriveRestoreOpen(true);
    void runSync().then(() => {
      if (r.then === 'drive-backup') void runDriveBackup({ manual: true });
      else if (!r.then && !status.error) toast('Conectado con Google Calendar ✓');
      if (!r.then) void runDriveBackup();
    });
    return;
  }
  if (r.silent && r.fallback && g.clientId) {
    // Lo pidió la persona: si la renovación silenciosa falla, mostramos Google.
    beginGoogleAuth(g.clientId, { email: r.email, drive: r.drive, then: r.then });
    return;
  }
  if (r.then && !r.silent) {
    toast(r.error === 'access_denied' ? 'Sin el permiso de Google Drive no se puede guardar la copia allí.' : 'No se pudo conectar con Google Drive.', { duration: 7000 });
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

/** Renueva el permiso (rebote rápido a Google) solo si hay algo que enviar o hace días que no hay copia en Drive. */
export function maybeAutoReconnect(): boolean {
  const g = getState().settings.google;
  if (!googleLinked() || !g.autoReconnect || hasValidToken()) return false;
  if ((pendingGoogleChanges() === 0 && !driveBackupOverdue()) || !canAutoAuth()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (document.visibilityState !== 'visible') return false;
  recordAutoAuth(false);
  beginGoogleAuth(g.clientId, { silent: true, email: g.email, drive: wantsDrive() });
  return true;
}
