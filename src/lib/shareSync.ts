import { useSyncExternalStore } from 'react';
import { applyFinanceSync, applyPlanSync, applySyncResult, getState, patchShare } from '../store/store';
import type { ID, ListItem, ShareConfig } from '../store/types';
import { financeOutbox, mergeFinance, type SharedRecords } from './financeSync';
import { mergePlans, planOutbox, PLANS_SCRIPT } from './planSync';

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

export interface ServerData {
  items: ListItem[];
  /** Cuenta conjunta (versión 3 o posterior del código de la hoja) y planes (versión 4). */
  registros?: SharedRecords;
  version: number;
  /** Hora de la hoja (para pedir la próxima vez solo lo nuevo). */
  ahora?: number;
}

async function readResponse(res: Response): Promise<ServerData> {
  const text = await res.text();
  let data: { ok?: boolean; error?: string; items?: ListItem[]; registros?: SharedRecords; version?: number; ahora?: number };
  try {
    data = JSON.parse(text);
  } catch {
    throw new ShareError('access', 'La hoja no responde bien. Revisa que la aplicación web tenga acceso «Cualquier usuario».');
  }
  if (!data.ok) {
    if (data.error === 'clave') throw new ShareError('key', 'La clave no coincide con la de la hoja. Vuelve a copiar el código.');
    throw new ShareError('server', 'La hoja ha devuelto un error.');
  }
  const items = (data.items ?? []).map((i) => ({
    id: String(i.id),
    list: i.list,
    text: String(i.text ?? ''),
    qty: i.qty || undefined,
    done: !!i.done,
    updatedAt: Number(i.updatedAt) || 0,
    by: i.by || undefined,
    deleted: !!i.deleted,
  }));
  return { items, registros: data.registros, version: Number(data.version) || 2, ahora: Number(data.ahora) || undefined };
}

async function call(
  share: Pick<ShareConfig, 'url' | 'key'>,
  changes: ListItem[] | null,
  registros: SharedRecords | null,
  desde: number,
  fetchImpl: FetchLike,
): Promise<ServerData> {
  let res: Response;
  try {
    if (changes === null && registros === null) {
      const sep = share.url.includes('?') ? '&' : '?';
      res = await fetchImpl(`${share.url}${sep}clave=${encodeURIComponent(share.key)}&desde=${desde}&t=${Date.now()}`, { method: 'GET', redirect: 'follow', cache: 'no-store' });
    } else {
      // Sin cabeceras: así el navegador no hace la consulta previa (CORS) que Apps Script no admite.
      const body = JSON.stringify({ clave: share.key, cambios: changes ?? [], ...(registros ? { registros } : {}), desde });
      res = await fetchImpl(share.url, { method: 'POST', redirect: 'follow', body });
    }
  } catch {
    throw new ShareError('offline', 'Sin conexión: los cambios se enviarán cuando vuelva internet.');
  }
  if (!res.ok) throw new ShareError('server', `La hoja ha respondido con un error (${res.status}).`);
  return readResponse(res);
}

export const fetchSharedItems = async (share: Pick<ShareConfig, 'url' | 'key'>, fetchImpl: FetchLike = fetch) => (await call(share, null, null, 0, fetchImpl)).items;
export const pushSharedItems = async (share: Pick<ShareConfig, 'url' | 'key'>, changes: ListItem[], fetchImpl: FetchLike = fetch) =>
  (await call(share, changes, null, 0, fetchImpl)).items;

/** Envía lo pendiente (listas y cuenta conjunta) y recibe lo nuevo desde `desde`. */
export function exchange(
  share: Pick<ShareConfig, 'url' | 'key'>,
  lists: ListItem[],
  records: SharedRecords,
  desde: number,
  fetchImpl: FetchLike = fetch,
): Promise<ServerData> {
  const hasRecords = Object.values(records).some((r) => r?.length);
  if (!lists.length && !hasRecords) return call(share, null, null, desde, fetchImpl);
  return call(share, lists, hasRecords ? records : null, desde, fetchImpl);
}

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

/** Tras abrir la app se pide todo una vez (así se olvida lo borrado hace tiempo); luego, solo lo nuevo. */
let fullDone = false;
const FULL_EVERY = 20 * 86400000;
/** Margen al pedir «lo nuevo» por si la otra petición estaba a medias. */
const OVERLAP = 2 * 60000;

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
      const me = s.settings.name.trim() || undefined;
      const out = financeOutbox(s.finance, me);
      // Con el código antiguo de la hoja los planes esperan (no se pierden) a que se actualice.
      const plansOk = (share.scriptVersion ?? PLANS_SCRIPT) >= PLANS_SCRIPT;
      const plans = planOutbox({ entries: s.entries, pending: plansOk ? s.planPending : [], gone: s.planGone }, me);
      const records: SharedRecords = plans.rows.length ? { ...out.records, Planes: plans.rows } : out.records;
      const full = !fullDone || !share.since || Date.now() - share.since > FULL_EVERY;
      try {
        const server = await exchange(share, sent, records, full ? 0 : Math.max(0, (share.since ?? 0) - OVERLAP));
        const cur = getState();
        if (!cur.share || cur.share.url !== share.url) return;
        const r = reconcile({ items: cur.listItems, pending: cur.listPending }, sent, server.items);
        const finOk = server.version >= 3 && !!server.registros;
        applySyncResult(r.items, r.pending, {
          lastSync: Date.now(),
          error: undefined,
          scriptVersion: server.version,
          ...(finOk && server.ahora ? { since: server.ahora } : {}),
        });
        if (finOk) {
          applyFinanceSync(mergeFinance(getState().finance, out.sent, server.registros!, full), {});
          if (full) fullDone = true;
        }
        if (server.version >= PLANS_SCRIPT && server.registros) {
          const st = getState();
          const merged = mergePlans(
            { entries: st.entries, pending: st.planPending, gone: st.planGone },
            plans.sent,
            server.registros.Planes ?? [],
            full,
            st.settings.defaultAlert,
          );
          applyPlanSync(merged);
          // Recién actualizado el código de la hoja: se envía ya lo que esperaba.
          if (!plansOk && merged.pending.length) again = true;
        }
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
