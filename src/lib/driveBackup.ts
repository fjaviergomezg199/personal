import { useSyncExternalStore } from 'react';
import { getState, updateSettings } from '../store/store';
import type { AppState, DriveBackup } from '../store/types';
import { applyBackup, backupData, readBackup } from './backup';
import { todayISO } from './dates';
import { DRIVE_SCOPE, GoogleApiError, GoogleAuthError, googleFetch, hasScope } from './google';

/*
 * Copia automática en Google Drive: una carpeta «Día a Día · copias» en el Drive
 * de cada uno, con una copia por día (se guardan las últimas 14). Con el permiso
 * «drive.file» la app solo ve lo que ha creado ella, no el resto del Drive.
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TAG = 'diaadia';
export const DRIVE_FOLDER = 'Día a Día · copias';
export const KEEP_COPIES = 14;
/** Hasta este tamaño se sube de una vez; lo más grande, por partes. */
const SIMPLE_MAX = 4 * 1024 * 1024;
const SERVICE = 'Google Drive';
const FIELDS = 'id,name,size,modifiedTime,appProperties';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

const kindOf = (f: DriveFile) => f.appProperties?.[TAG];

/* ---------- API de Drive ---------- */

const call = (url: string, init: RequestInit = {}) => googleFetch(url, init, SERVICE);
const asFile = async (res: Response) => (await res.json()) as DriveFile;

async function list(q: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ q, spaces: 'drive', pageSize: '200', fields: `nextPageToken,files(${FIELDS})` });
    if (pageToken) params.set('pageToken', pageToken);
    const r = (await (await call(`${API}/files?${params}`)).json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(r.files ?? []));
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

const childrenOf = (folder: string) => list(`'${folder}' in parents and trashed = false`);

async function findFolder(): Promise<string | undefined> {
  const found = await list(`appProperties has { key='${TAG}' and value='carpeta' } and mimeType = '${FOLDER_MIME}' and trashed = false`);
  return found[0]?.id;
}

async function createFolder(name: string, kind: string, parent?: string): Promise<string> {
  const res = await call(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: { [TAG]: kind }, ...(parent ? { parents: [parent] } : {}) }),
  });
  return (await asFile(res)).id;
}

/** Sube un archivo nuevo: de una vez si es pequeño; si no, por partes. */
async function createFile(meta: Record<string, unknown>, blob: Blob): Promise<DriveFile> {
  if (blob.size > SIMPLE_MAX) return resumable(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, 'POST', meta, blob);
  const boundary = `diaadia${Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  return asFile(await call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }));
}

/** Cambia el contenido de un archivo que ya está en Drive. */
async function replaceFile(id: string, blob: Blob): Promise<DriveFile> {
  if (blob.size > SIMPLE_MAX) return resumable(`${UPLOAD}/files/${id}?uploadType=resumable&fields=${FIELDS}`, 'PATCH', {}, blob);
  return asFile(await call(`${UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }));
}

async function resumable(url: string, method: 'POST' | 'PATCH', meta: Record<string, unknown>, blob: Blob): Promise<DriveFile> {
  const type = blob.type || 'application/octet-stream';
  const start = await call(url, {
    method,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(meta),
  });
  const session = start.headers.get('Location');
  if (!session) throw new GoogleApiError(500, 'Google Drive no ha dado dirección de subida', SERVICE);
  return asFile(await call(session, { method: 'PUT', headers: { 'Content-Type': type }, body: blob }));
}

const trash = (id: string) =>
  call(`${API}/files/${id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });

const download = (id: string) => call(`${API}/files/${id}?alt=media`);

/* ---------- Cuándo toca ---------- */

/** Huella de los datos: si nada ha cambiado desde la última copia, no se sube otra. */
export function fingerprint(s: AppState): string {
  const clean = {
    ...s,
    googleEvents: [],
    googleCalendars: [],
    notified: {},
    settings: { ...s.settings, lastBackup: undefined, drive: undefined, google: { ...s.settings.google, lastSync: undefined } },
  };
  const str = JSON.stringify(clean);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${str.length}`;
}

/** Una copia al día como mucho, solo si algo ha cambiado (y sin insistir más de una vez por hora si falla). */
export function driveBackupDue(s: AppState = getState(), now = new Date()): boolean {
  const d = s.settings.drive;
  if (!d?.on || d.skipDay === todayISO(now)) return false;
  if (d.last && todayISO(new Date(d.last)) === todayISO(now)) return false;
  if (d.error && d.tried && now.getTime() - Date.parse(d.tried) < 3600000) return false;
  return d.hash !== fingerprint(s);
}

/** Hace días que no hay copia: vale la pena renovar el permiso de Google al abrir la app. */
export function driveBackupOverdue(s: AppState = getState(), now = new Date()): boolean {
  const d = s.settings.drive;
  if (!d?.on || d.error || d.skipDay === todayISO(now) || !s.settings.google.clientId) return false;
  if (d.last && now.getTime() - Date.parse(d.last) < 2 * 86400000) return false;
  return d.hash !== fingerprint(s);
}

function saveDrive(patch: Partial<DriveBackup>) {
  const cur = getState().settings.drive ?? { on: false };
  updateSettings({ drive: { ...cur, ...patch } });
}

/* ---------- Copia ---------- */

export type DriveResult =
  | { status: 'ok'; copies: number }
  | { status: 'unchanged' }
  | { status: 'needs-auth' }
  | { status: 'offline' }
  | { status: 'error'; message: string; link?: string };

/** Qué ha pasado, en cristiano (y cómo arreglarlo si se puede). */
export function describeDriveError(err: unknown): Exclude<DriveResult, { status: 'ok' } | { status: 'unchanged' }> {
  if (err instanceof GoogleAuthError) return { status: 'needs-auth' };
  if (err instanceof TypeError) return { status: 'offline' };
  if (err instanceof GoogleApiError) {
    if (err.status === 403 && /insufficient|ACCESS_TOKEN_SCOPE/i.test(err.body)) return { status: 'needs-auth' };
    if (err.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(err.body)) {
      const link = /https:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s"'\\]+/.exec(err.body)?.[0];
      return {
        status: 'error',
        message: 'Falta activar la API de Google Drive en vuestro proyecto de Google Cloud (es un botón).',
        link: link ?? 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
      };
    }
    if (/storageQuotaExceeded|quotaExceeded/.test(err.body)) return { status: 'error', message: 'Tu Google Drive está lleno: libera espacio para que quepa la copia.' };
    return { status: 'error', message: `Google Drive ha respondido con un error (${err.status}).` };
  }
  if (err instanceof Error && err.message) return { status: 'error', message: err.message };
  return { status: 'error', message: 'No se pudo conectar con Google Drive.' };
}

function failed(err: unknown): DriveResult {
  const r = describeDriveError(err);
  if (r.status === 'error') saveDrive({ error: r.message, errorLink: r.link });
  return r;
}

let running: Promise<DriveResult> | null = null;
const runningListeners = new Set<() => void>();
const emitRunning = () => runningListeners.forEach((l) => l());

export function useDriveRunning(): boolean {
  return useSyncExternalStore(
    (cb) => {
      runningListeners.add(cb);
      return () => runningListeners.delete(cb);
    },
    () => running !== null,
  );
}

/** Sube la copia de hoy (con `force`, aunque no haya cambios). */
export function backupToDrive(opts: { force?: boolean } = {}): Promise<DriveResult> {
  if (!running) {
    running = doBackup(!!opts.force).finally(() => {
      running = null;
      emitRunning();
    });
    emitRunning();
  }
  return running;
}

async function doBackup(force: boolean): Promise<DriveResult> {
  if (!hasScope(DRIVE_SCOPE)) return { status: 'needs-auth' };
  const s = getState();
  const hash = fingerprint(s);
  if (!force && s.settings.drive?.hash === hash) return { status: 'unchanged' };
  saveDrive({ tried: new Date().toISOString() });
  try {
    const folder = (await findFolder()) ?? (await createFolder(DRIVE_FOLDER, 'carpeta'));
    const inFolder = await childrenOf(folder);

    // La copia del día (si ya había una de hoy, se sustituye) y fuera las más viejas.
    const day = todayISO();
    const body = new Blob([JSON.stringify(backupData(s))], { type: 'application/json' });
    const copies = inFolder.filter((f) => kindOf(f) === 'copia').sort((a, b) => (b.appProperties?.day ?? '').localeCompare(a.appProperties?.day ?? ''));
    const todays = copies.find((f) => f.appProperties?.day === day);
    if (todays) await replaceFile(todays.id, body);
    else copies.unshift(await createFile({ name: `dia-a-dia-${day}.json`, parents: [folder], mimeType: 'application/json', appProperties: { [TAG]: 'copia', day } }, body));
    for (const old of copies.slice(KEEP_COPIES)) await trash(old.id);

    const kept = Math.min(copies.length, KEEP_COPIES);
    saveDrive({ last: new Date().toISOString(), hash, copies: kept, error: undefined, errorLink: undefined });
    return { status: 'ok', copies: kept };
  } catch (err) {
    return failed(err);
  }
}

/* ---------- Recuperar ---------- */

export interface DriveCopy {
  id: string;
  day: string;
  size: number;
  modified?: string;
}

export async function listDriveCopies(): Promise<DriveCopy[]> {
  const folder = await findFolder();
  if (!folder) return [];
  return (await childrenOf(folder))
    .filter((f) => kindOf(f) === 'copia' && f.appProperties?.day)
    .map((f) => ({ id: f.id, day: f.appProperties!.day, size: Number(f.size) || 0, modified: f.modifiedTime }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Recupera una copia. */
export async function restoreFromDrive(copy: Pick<DriveCopy, 'id'>): Promise<{ categories: number; entries: number }> {
  const data = readBackup(await (await download(copy.id)).text());
  const r = applyBackup(data);
  // Quien recupera de Drive quiere seguir teniendo la copia (desde mañana: hoy no se pisa la de hoy).
  saveDrive({ on: true, skipDay: todayISO(), error: undefined, errorLink: undefined });
  return r;
}

/* ---------- Hoja para elegir la copia (se abre desde Ajustes, la bienvenida o al volver de Google) ---------- */

let restoreOpen = false;
const restoreListeners = new Set<() => void>();

export function setDriveRestoreOpen(open: boolean) {
  restoreOpen = open;
  restoreListeners.forEach((l) => l());
}

export function useDriveRestoreOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      restoreListeners.add(cb);
      return () => restoreListeners.delete(cb);
    },
    () => restoreOpen,
  );
}
