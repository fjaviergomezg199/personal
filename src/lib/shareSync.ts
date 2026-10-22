import { useSyncExternalStore } from 'react';
import { applyFinanceSync, applyPlanSync, applySyncResult, getState, patchShare } from '../store/store';
import type { ID, ListItem, ShareConfig } from '../store/types';
import { financeOutbox, mergeFinance, type SharedRecords } from './financeSync';
import { mergePlans, planOutbox, PLANS_SCRIPT } from './planSync';

/*
 * Hogar compartido: lo compartido se guarda en una hoja de cálculo de Google con
 * un pequeño Apps Script (ver shareScript.ts): la del servidor de la app (cada
 * hogar la suya, se entra con un código) o una vuestra. Cada móvil envía sus
 * cambios y recibe lo nuevo; si los dos cambian lo mismo, gana el último.
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

/* ---------- Código del hogar en el servidor de la app ---------- */

/** Letras y números sin los que se confunden (ni I, ni L, ni O, ni U). */
const HOME_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const HOME_CODE_LENGTH = 12;

export function newHomeCode(): string {
  const bytes = new Uint8Array(HOME_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => HOME_ALPHABET[b & 31]).join('');
}

/** «K7P4QX9MZT2W» → «K7P4-QX9M-ZT2W». */
export const formatHomeCode = (code: string) => code.match(/.{1,4}/g)?.join('-') ?? '';

/**
 * El código de un hogar en lo que se escribe o se pega (vale el mensaje de
 * WhatsApp entero). Da igual mayúsculas, guiones o espacios, y una O por un 0.
 */
export function readHomeCode(text: string): string | null {
  const grouped = [...text.matchAll(/(?:^|[^0-9A-Za-z])([0-9A-Za-z]{4})[\s-]+([0-9A-Za-z]{4})[\s-]+([0-9A-Za-z]{4})(?![0-9A-Za-z])/g)].map((m) => m.slice(1).join(''));
  for (const raw of [...grouped, text.replace(/[\s-]/g, '')]) {
    if (raw.length !== HOME_CODE_LENGTH) continue;
    const code = raw.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
    if ([...code].every((c) => HOME_ALPHABET.includes(c))) return code;
  }
  return null;
}

/* ---------- Código para unirse a una hoja vuestra (forma avanzada) ---------- */

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
  /** Pestañas que la hoja no ha podido usar (una vuestra con el mismo nombre…). */
  bloqueados?: string[];
}

type ShareTarget = Pick<ShareConfig, 'url' | 'key' | 'central'>;

async function readResponse(res: Response, central?: boolean): Promise<ServerData> {
  const text = await res.text();
  let data: { ok?: boolean; error?: string; items?: ListItem[]; registros?: SharedRecords; version?: number; ahora?: number; bloqueados?: string[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw central
      ? new ShareError('server', 'El servidor de la app no responde bien. Prueba en un rato.')
      : new ShareError('access', 'La hoja no responde bien. Revisa que la aplicación web tenga acceso «Cualquier usuario».');
  }
  if (!data.ok) {
    if (data.error === 'clave')
      throw new ShareError('key', central ? 'El servidor no conoce el código de este hogar. Vuelve a unirte con el código.' : 'La clave no coincide con la de la hoja. Vuelve a copiar el código.');
    if (data.error === 'lleno') throw new ShareError('server', 'El servidor de la app no admite más hogares. Avisa a quien mantiene la app.');
    if (data.error === 'espera') throw new ShareError('server', 'Hoy se han creado muchos hogares. Prueba mañana.');
    throw new ShareError('server', central ? 'El servidor de la app ha devuelto un error.' : 'La hoja ha devuelto un error.');
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
  return {
    items,
    registros: data.registros,
    version: Number(data.version) || 2,
    ahora: Number(data.ahora) || undefined,
    bloqueados: Array.isArray(data.bloqueados) ? data.bloqueados.map(String) : undefined,
  };
}

async function call(
  share: ShareTarget,
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
  if (!res.ok) throw new ShareError('server', `${share.central ? 'El servidor' : 'La hoja'} ha respondido con un error (${res.status}).`);
  return readResponse(res, share.central);
}

export const fetchSharedItems = async (share: ShareTarget, fetchImpl: FetchLike = fetch) => (await call(share, null, null, 0, fetchImpl)).items;
export const pushSharedItems = async (share: ShareTarget, changes: ListItem[], fetchImpl: FetchLike = fetch) => (await call(share, changes, null, 0, fetchImpl)).items;

/** Crea el hogar en el servidor de la app con el código que se va a compartir (si ya existe, vale ese). */
export async function createHome(share: Pick<ShareConfig, 'url' | 'key'>, name: string, fetchImpl: FetchLike = fetch): Promise<ServerData> {
  let res: Response;
  try {
    const body = JSON.stringify({ accion: 'crear', clave: share.key, nombre: name, cambios: [], desde: 0 });
    res = await fetchImpl(share.url, { method: 'POST', redirect: 'follow', body });
  } catch {
    throw new ShareError('offline', 'Sin conexión: para crear el hogar hace falta internet.');
  }
  if (!res.ok) throw new ShareError('server', `El servidor ha respondido con un error (${res.status}).`);
  return readResponse(res, true);
}

/** Envía lo pendiente (listas y cuenta conjunta) y recibe lo nuevo desde `desde`. */
export function exchange(
  share: ShareTarget,
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
export async function syncOnce(local: LocalLists, share: ShareTarget, fetchImpl: FetchLike = fetch): Promise<LocalLists> {
  const sentIds = new Set(local.pending);
  const sent = local.items.filter((i) => sentIds.has(i.id));
  const server = sent.length ? await pushSharedItems(share, sent, fetchImpl) : await fetchSharedItems(share, fetchImpl);
  return reconcile(local, sent, server);
}

/* ---------- Sincronización de la app ---------- */

const WHAT: Record<string, string> = { Planes: 'los planes en pareja', Movimientos: 'la cuenta conjunta', Fijos: 'la cuenta conjunta', Cuenta: 'la cuenta conjunta' };

/** Aviso si la hoja no ha podido usar alguna pestaña (lo de esa pestaña sigue guardado en el móvil). */
export function blockedNotice(names: string[] | undefined): string | undefined {
  if (!names?.length) return undefined;
  const tabs = names.map((n) => `«${n}»`);
  const list = tabs.length === 1 ? tabs[0] : `${tabs.slice(0, -1).join(', ')} y ${tabs.at(-1)}`;
  const what = [...new Set(names.map((n) => WHAT[n] ?? 'todo'))].join(' y ');
  return `Cambia el nombre de ${tabs.length === 1 ? 'la pestaña' : 'las pestañas'} ${list} de vuestra hoja de Google (la app ${tabs.length === 1 ? 'la' : 'las'} necesita para compartir ${what}). Mientras, se guarda en el móvil.`;
}

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
          error: blockedNotice(server.bloqueados),
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
            server.registros.Planes,
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
