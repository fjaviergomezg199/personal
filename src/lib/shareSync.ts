import { useSyncExternalStore } from 'react';
import { applySyncResult, getState, patchShare } from '../store/store';
import type { ID, ListItem, ShareConfig } from '../store/types';

/*
 * Hogar compartido: las listas se guardan en una hoja de cálculo de Google con
 * un pequeño Apps Script (ver shareScript.ts). Cada móvil envía sus cambios y
 * recibe la lista completa; si los dos cambian lo mismo, gana el último.
 */

export interface LocalLists {
  items: ListItem[];
  pending: ID[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ShareError extends Error {
  constructor(
    public code: 'offline' | 'access' | 'key' | 'server',
    message: string,
  ) {
    super(message);
  }
}

export const SHARE_URL_RE = /^https:\/\/script\.google\.com\/(?:a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/;

export function newShareKey(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/* ---------- Código para que se una la otra persona ---------- */

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function makeJoinCode(share: Pick<ShareConfig, 'url' | 'key' | 'name'>): string {
  return `DD1.${b64url(JSON.stringify({ u: share.url, k: share.key, n: share.name }))}`;
}

/** Acepta el código aunque venga rodeado de texto (copiado de WhatsApp...). */
export function readJoinCode(text: string): Pick<ShareConfig, 'url' | 'key' | 'name'> | null {
  const m = /DD1\.([A-Za-z0-9_-]+)/.exec(text);
  if (!m) return null;
  try {
    const o = JSON.parse(unb64url(m[1])) as { u?: string; k?: string; n?: string };
    if (!o.u || !o.k || !SHARE_URL_RE.test(o.u)) return null;
    return { url: o.u, key: o.k, name: o.n || 'Hogar' };
  } catch {
    return null;
  }
}

/* ---------- Comunicación con la hoja ---------- */

async function readResponse(res: Response): Promise<ListItem[]> {
  const text = await res.text();
  let data: { ok?: boolean; error?: string; items?: ListItem[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new ShareError('access', 'La hoja no responde bien. Revisa que la aplicación web tenga acceso «Cualquier usuario».');
  }
  if (!data.ok) {
    if (data.error === 'clave') throw new ShareError('key', 'La clave no coincide con la de la hoja. Vuelve a copiar el código.');
    throw new ShareError('server', 'La hoja ha devuelto un error.');
  }
  return (data.items ?? []).map((i) => ({
    id: String(i.id),
    list: i.list,
    text: String(i.text ?? ''),
    qty: i.qty || undefined,
    done: !!i.done,
    updatedAt: Number(i.updatedAt) || 0,
    by: i.by || undefined,
    deleted: !!i.deleted,
  }));
}

async function call(share: Pick<ShareConfig, 'url' | 'key'>, changes: ListItem[] | null, fetchImpl: FetchLike): Promise<ListItem[]> {
  let res: Response;
  try {
    if (changes === null) {
      const sep = share.url.includes('?') ? '&' : '?';
      res = await fetchImpl(`${share.url}${sep}clave=${encodeURIComponent(share.key)}&t=${Date.now()}`, { method: 'GET', redirect: 'follow', cache: 'no-store' });
    } else {
      // Sin cabeceras: así el navegador no hace la consulta previa (CORS) que Apps Script no admite.
      res = await fetchImpl(share.url, { method: 'POST', redirect: 'follow', body: JSON.stringify({ clave: share.key, cambios: changes }) });
    }
  } catch {
    throw new ShareError('offline', 'Sin conexión: los cambios se enviarán cuando vuelva internet.');
  }
  if (!res.ok) throw new ShareError('server', `La hoja ha respondido con un error (${res.status}).`);
  return readResponse(res);
}

export const fetchSharedItems = (share: Pick<ShareConfig, 'url' | 'key'>, fetchImpl: FetchLike = fetch) => call(share, null, fetchImpl);
export const pushSharedItems = (share: Pick<ShareConfig, 'url' | 'key'>, changes: ListItem[], fetchImpl: FetchLike = fetch) =>
  call(share, changes, fetchImpl);

/* ---------- Fusión ---------- */

/** Une lo que hay en el móvil con lo que dice la hoja. Lo pendiente y más nuevo de aquí se respeta. */
export function mergeLists(local: ListItem[], pending: Set<ID>, server: ListItem[]): LocalLists {
  const localById = new Map(local.map((i) => [i.id, i]));
  const items: ListItem[] = [];
  const stillPending: ID[] = [];
  const seen = new Set<ID>();
  for (const s of server) {
    seen.add(s.id);
    const l = localById.get(s.id);
    if (l && pending.has(l.id) && l.updatedAt > s.updatedAt) {
      items.push(l);
      stillPending.push(l.id);
    } else items.push(s);
  }
  for (const l of local) {
    if (seen.has(l.id)) continue;
    // Aún no ha llegado a la hoja: se queda. Si no estaba pendiente, la hoja ya lo olvidó.
    if (pending.has(l.id)) {
      items.push(l);
      stillPending.push(l.id);
    }
  }
  return { items, pending: stillPending };
}

/** Tras enviar `sent`, lo que no ha vuelto a cambiar aquí deja de estar pendiente. */
export function reconcile(current: LocalLists, sent: ListItem[], server: ListItem[]): LocalLists {
  const pending = new Set(current.pending);
  const now = new Map(current.items.map((i) => [i.id, i]));
  for (const s of sent) {
    const c = now.get(s.id);
    if (!c || c.updatedAt === s.updatedAt) pending.delete(s.id);
  }
  return mergeLists(current.items, pending, server);
}

/** Una vuelta completa (enviar lo pendiente o, si no hay nada, recibir). */
export async function syncOnce(local: LocalLists, share: Pick<ShareConfig, 'url' | 'key'>, fetchImpl: FetchLike = fetch): Promise<LocalLists> {
  const sentIds = new Set(local.pending);
  const sent = local.items.filter((i) => sentIds.has(i.id));
  const server = sent.length ? await pushSharedItems(share, sent, fetchImpl) : await fetchSharedItems(share, fetchImpl);
  return reconcile(local, sent, server);
}

/* ---------- Sincronización de la app ---------- */

let syncing = false;
let again = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useShareSyncing(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => syncing,
  );
}

export async function syncShare(): Promise<void> {
  if (syncing) {
    again = true;
    return;
  }
  syncing = true;
  emit();
  try {
    do {
      again = false;
      const s = getState();
      const share = s.share;
      if (!share) return;
      const sentIds = new Set(s.listPending);
      const sent = s.listItems.filter((i) => sentIds.has(i.id));
      try {
        const server = sent.length ? await pushSharedItems(share, sent) : await fetchSharedItems(share);
        const cur = getState();
        if (!cur.share || cur.share.url !== share.url) return;
        const r = reconcile({ items: cur.listItems, pending: cur.listPending }, sent, server);
        applySyncResult(r.items, r.pending, { lastSync: Date.now(), error: undefined });
      } catch (err) {
        patchShare({ error: err instanceof ShareError ? err.message : 'No se pudo sincronizar.' });
        return;
      }
    } while (again);
  } finally {
    syncing = false;
    emit();
  }
}
