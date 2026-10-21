/**
 * Google Calendar (y la copia en Drive) sin servidor: OAuth 2.0 "implícito" con
 * redirección en la misma ventana (funciona dentro de la app instalada en iPhone
 * y Android) y llamadas directas a las APIs de Google.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://www.googleapis.com/calendar/v3';
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];
/** Solo los archivos que crea la app (la carpeta de copias), no el resto del Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'diaadia:gtoken';
const PENDING_KEY = 'diaadia:gauth';
const AUTO_KEY = 'diaadia:gauto';

export class GoogleAuthError extends Error {
  constructor() {
    super('Hay que volver a conectar con Google');
  }
}

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    service = 'Google Calendar',
  ) {
    super(`${service} respondió ${status}: ${body.slice(0, 200)}`);
  }
}

/** Qué hacer al volver de Google (si se fue a pedir permiso para algo concreto). */
export type AfterAuth = 'drive-backup' | 'drive-restore';

/** URL base de la app (la que hay que registrar como URI de redirección). */
export function appBaseUrl(): string {
  const u = new URL('./', location.href);
  u.hash = '';
  u.search = '';
  return u.href;
}

export function appOrigin(): string {
  return location.origin;
}

interface StoredToken {
  token: string;
  expiresAt: number;
  /** Permisos concedidos (los tokens antiguos no lo guardaban: solo Calendar). */
  scopes?: string[];
}

export function getToken(): StoredToken | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as StoredToken | null;
    return t && t.expiresAt > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export function hasValidToken(): boolean {
  return getToken() !== null;
}

export function hasScope(scope: string): boolean {
  const t = getToken();
  return !!t && (t.scopes ?? GOOGLE_SCOPES).includes(scope);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Va a Google para pedir permiso (o renovarlo sin pantallas si `silent`). Con `drive`, también para la copia en Drive. */
export function beginGoogleAuth(
  clientId: string,
  opts: { silent?: boolean; email?: string; fallback?: boolean; drive?: boolean; then?: AfterAuth } = {},
): void {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const route = location.hash && !/access_token|error=/.test(location.hash) ? location.hash : '#/hoy';
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ state, route, silent: !!opts.silent, fallback: !!opts.fallback, email: opts.email, drive: !!opts.drive, then: opts.then, at: Date.now() }),
  );
  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: appBaseUrl(),
    response_type: 'token',
    scope: [...GOOGLE_SCOPES, ...(opts.drive ? [DRIVE_SCOPE] : [])].join(' '),
    include_granted_scopes: 'true',
    state,
  });
  if (opts.silent) params.set('prompt', 'none');
  if (opts.email) params.set('login_hint', opts.email);
  location.assign(`${AUTH_URL}?${params.toString()}`);
}

export type RedirectResult =
  | { status: 'ok'; then?: AfterAuth }
  | { status: 'error'; error: string; silent: boolean; fallback: boolean; email?: string; drive?: boolean; then?: AfterAuth };

/** Al arrancar: procesa la vuelta de Google (#access_token=... o #error=...). */
export function consumeGoogleRedirect(): RedirectResult | null {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!/(^|&)(access_token|error)=/.test(hash)) return null;
  const params = new URLSearchParams(hash);
  let pending: { state: string; route: string; silent: boolean; fallback: boolean; email?: string; drive?: boolean; then?: AfterAuth } | null = null;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
  } catch {
    pending = null;
  }
  localStorage.removeItem(PENDING_KEY);
  history.replaceState(null, '', location.pathname + location.search + (pending?.route ?? '#/hoy'));
  if (!pending || params.get('state') !== pending.state) {
    return { status: 'error', error: 'state_mismatch', silent: false, fallback: false };
  }
  const error = params.get('error');
  if (error) return { status: 'error', error, silent: pending.silent, fallback: pending.fallback, email: pending.email, drive: pending.drive, then: pending.then };
  const token = params.get('access_token');
  if (!token) return { status: 'error', error: 'no_token', silent: pending.silent, fallback: false, then: pending.then };
  const expiresIn = Number(params.get('expires_in') ?? 3600);
  const scopes = (params.get('scope') ?? '').split(/\s+/).filter(Boolean);
  const stored: StoredToken = { token, expiresAt: Date.now() + (expiresIn - 120) * 1000, ...(scopes.length ? { scopes } : {}) };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
  return { status: 'ok', then: pending.then };
}

/** Control para no rebotar a Google en bucle al abrir la app. */
export function canAutoAuth(): boolean {
  try {
    const last = JSON.parse(localStorage.getItem(AUTO_KEY) ?? 'null') as { at: number; failed: boolean } | null;
    if (!last) return true;
    if (last.failed) return false;
    return Date.now() - last.at > 20 * 60000;
  } catch {
    return true;
  }
}

export function recordAutoAuth(failed: boolean): void {
  localStorage.setItem(AUTO_KEY, JSON.stringify({ at: Date.now(), failed }));
}

export function resetAutoAuth(): void {
  localStorage.removeItem(AUTO_KEY);
}

/** Petición a una API de Google con el permiso guardado. */
export async function googleFetch(url: string, init: RequestInit = {}, service?: string): Promise<Response> {
  const t = getToken();
  if (!t) throw new GoogleAuthError();
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t.token}`, ...(init.headers ?? {}) } });
  if (res.status === 401) {
    clearToken();
    throw new GoogleAuthError();
  }
  if (!res.ok) throw new GoogleApiError(res.status, await res.text(), service);
  return res;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await googleFetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

/* Tipos mínimos de la API */
export interface GCalDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
export interface GCalEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: GCalDate;
  end: GCalDate;
  recurrence?: string[];
  reminders?: { useDefault: boolean; overrides?: { method: 'popup' | 'email'; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string> };
}
export interface GCalCalendar {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole: string;
}

export const gcal = {
  async calendars(): Promise<GCalCalendar[]> {
    const r = await api<{ items: GCalCalendar[] }>('/users/me/calendarList?maxResults=250');
    return r.items ?? [];
  },
  async events(calendarId: string, timeMin: Date, timeMax: Date): Promise<GCalEvent[]> {
    const out: GCalEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const q = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: '2500',
      });
      if (pageToken) q.set('pageToken', pageToken);
      const r = await api<{ items: GCalEvent[]; nextPageToken?: string }>(`/calendars/${enc(calendarId)}/events?${q}`);
      out.push(...(r.items ?? []));
      pageToken = r.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  },
  insert(calendarId: string, body: Partial<GCalEvent>): Promise<GCalEvent> {
    return api(`/calendars/${enc(calendarId)}/events`, { method: 'POST', body: JSON.stringify(body) });
  },
  update(calendarId: string, eventId: string, body: Partial<GCalEvent>): Promise<GCalEvent> {
    return api(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'PUT', body: JSON.stringify(body) });
  },
  remove(calendarId: string, eventId: string): Promise<void> {
    return api(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'DELETE' });
  },
};

/** Enlace "añadir a Google Calendar" (no necesita conectar nada). */
export function googleTemplateUrl(p: { title: string; date: string; time?: string; endTime?: string; endDate?: string; details?: string; location?: string; recur?: string }): string {
  const compact = (d: string) => d.replace(/-/g, '');
  const nextDay = (d: string) => {
    const dt = new Date(`${d}T12:00:00`);
    dt.setDate(dt.getDate() + 1);
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
  };
  let dates: string;
  if (p.time) {
    const start = `${compact(p.date)}T${p.time.replace(':', '')}00`;
    const endT = p.endTime ?? p.time;
    let end = `${compact(p.date)}T${endT.replace(':', '')}00`;
    if (!p.endTime) {
      const [h, m] = p.time.split(':').map(Number);
      const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
      end = `${compact(p.date)}T${String(Math.floor(total / 60)).padStart(2, '0')}${String(total % 60).padStart(2, '0')}00`;
    }
    dates = `${start}/${end}`;
  } else {
    dates = `${compact(p.date)}/${nextDay(p.endDate ?? p.date)}`;
  }
  const q = new URLSearchParams({ action: 'TEMPLATE', text: p.title, dates });
  if (p.details) q.set('details', p.details);
  if (p.location) q.set('location', p.location);
  if (p.recur) q.set('recur', p.recur);
  try {
    q.set('ctz', Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    /* sin zona */
  }
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
