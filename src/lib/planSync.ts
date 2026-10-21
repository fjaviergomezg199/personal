import type { Entry, EntryKind, GoogleLink, ID, Repeat } from '../store/types';
import { isISODate } from './dates';
import type { Row } from './financeSync';

/*
 * Planes en pareja: los recordatorios, planes y tareas marcados «en pareja» van
 * a la hoja compartida (pestaña «Planes»), una fila cada uno. Gana el cambio más
 * reciente. Lo de cada uno no viaja: el aviso, el área y su Google Calendar.
 */

/** Desde qué versión del código de la hoja se comparten los planes. */
export const PLANS_SCRIPT = 4;

export interface PlanState {
  entries: Entry[];
  /** Planes cambiados aquí y aún no enviados. */
  pending: ID[];
  /** Planes borrados aquí (se envían como borrados). */
  gone: { id: ID; at: number }[];
}

const KINDS: EntryKind[] = ['reminder', 'event', 'task'];
const REPEATS: Repeat[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const yes = (v: string | undefined) => v === 'true' || v === 'TRUE';
const iso = (ms: number) => new Date(ms).toISOString();

/** Versión de un plan para decidir qué cambio gana. */
export const planVersion = (e: Pick<Entry, 'updatedAt'>): number => Date.parse(e.updatedAt) || 0;

/** Lo que ven los dos. */
function content(e: Entry): Row {
  return {
    tipo: e.kind,
    titulo: e.title,
    fecha: e.date ?? '',
    hora: e.time ?? '',
    horaFin: e.endTime ?? '',
    fechaFin: e.endDate ?? '',
    repite: e.repeat,
    repiteHasta: e.repeatUntil ?? '',
    lugar: e.location ?? '',
    enlace: e.url ?? '',
    notas: e.notes ?? '',
    categoria: e.category ?? '',
    importante: e.important ? 'true' : 'false',
    hecho: e.done ? 'true' : 'false',
    hechoDias: (e.doneDates ?? []).join(','),
  };
}

/** ¿Ha cambiado algo de lo que ven los dos? (el aviso o el área no cuentan). */
export function sameShared(a: Entry, b: Entry): boolean {
  return JSON.stringify(content(a)) === JSON.stringify(content(b));
}

export function entryToRow(e: Entry): Row {
  return {
    id: e.id,
    ...content(e),
    // El aviso de quien lo crea es el que tendrá el otro al recibirlo (luego cada uno pone el suyo).
    aviso: e.alert === null || e.alert === undefined ? '' : String(e.alert),
    por: e.by ?? '',
    actualizado: String(planVersion(e)),
    borrado: 'false',
  };
}

const removed = (id: ID, at: number, by?: string): Row => ({ id, por: by ?? '', actualizado: String(at), borrado: 'true' });

type Shared = Pick<
  Entry,
  'kind' | 'title' | 'date' | 'time' | 'endTime' | 'endDate' | 'repeat' | 'repeatUntil' | 'location' | 'url' | 'notes' | 'category' | 'important' | 'done' | 'doneDates'
>;

function readRow(r: Row): Shared | null {
  const kind = KINDS.includes(r.tipo as EntryKind) ? (r.tipo as EntryKind) : 'event';
  const date = isISODate(r.fecha) ? r.fecha : undefined;
  if (!date && kind !== 'task') return null;
  const time = date && HHMM_RE.test(r.hora ?? '') ? r.hora : undefined;
  const repeat = date && REPEATS.includes(r.repite as Repeat) ? (r.repite as Repeat) : 'none';
  return {
    kind,
    title: (r.titulo ?? '').trim() || '(Sin título)',
    date,
    time,
    endTime: time && HHMM_RE.test(r.horaFin ?? '') ? r.horaFin : undefined,
    endDate: date && isISODate(r.fechaFin) && r.fechaFin >= date ? r.fechaFin : undefined,
    repeat,
    repeatUntil: repeat !== 'none' && isISODate(r.repiteHasta) ? r.repiteHasta : undefined,
    location: r.lugar || undefined,
    url: r.enlace || undefined,
    notes: r.notas || undefined,
    category: r.categoria || undefined,
    important: yes(r.importante) || undefined,
    done: yes(r.hecho) || undefined,
    doneDates: r.hechoDias ? r.hechoDias.split(',').filter(isISODate) : undefined,
  };
}

function rowAlert(r: Row): number | null | undefined {
  if (r.aviso === undefined) return undefined;
  if (r.aviso === '') return null;
  const n = Number(r.aviso);
  return Number.isFinite(n) && n >= 0 && n <= 60 * 24 * 28 ? n : undefined;
}

const defaultAlertFor = (p: Shared, defaultAlert: number | null) => (p.time && p.kind !== 'task' ? defaultAlert : null);

/** Lo pendiente de enviar, y con qué versión se envía cada cosa. */
export function planOutbox(s: PlanState, by?: string): { rows: Row[]; sent: Map<ID, number> } {
  const rows: Row[] = [];
  const sent = new Map<ID, number>();
  for (const id of s.pending) {
    const e = s.entries.find((x) => x.id === id);
    const gone = s.gone.find((g) => g.id === id);
    if (e) {
      // Si se ha dejado de compartir, para el otro es como si se borrara.
      rows.push(e.shared ? entryToRow(e) : removed(id, planVersion(e), by));
      sent.set(id, planVersion(e));
    } else if (gone) {
      rows.push(removed(id, gone.at, by));
      sent.set(id, gone.at);
    } else sent.set(id, -1);
  }
  return { rows, sent };
}

function versionNow(s: PlanState, id: ID): number | undefined {
  const e = s.entries.find((x) => x.id === id);
  return e ? planVersion(e) : s.gone.find((g) => g.id === id)?.at;
}

/**
 * Une lo que dice la hoja con la agenda de este móvil. Lo pendiente y más nuevo
 * de aquí se respeta. Con `full` la hoja trae todo: un plan compartido que no
 * venga (y no esté pendiente) es que ya no existe. Sin `rows` (la hoja no tiene la
 * pestaña de planes o no ha podido usarla), todo se queda y se vuelve a enviar.
 */
export function mergePlans(
  cur: PlanState,
  sent: Map<ID, number>,
  rows: Row[] | undefined,
  full: boolean,
  defaultAlert: number | null,
): PlanState & { googleDeletes: GoogleLink[]; changed: boolean } {
  if (!rows) {
    const again = new Set(cur.pending.filter((id) => sent.get(id) !== -1));
    for (const e of cur.entries) if (e.shared) again.add(e.id);
    for (const g of cur.gone) again.add(g.id);
    return { entries: cur.entries, pending: [...again], gone: cur.gone, googleDeletes: [], changed: false };
  }
  // Lo enviado que no ha vuelto a cambiar aquí ya está en la hoja.
  const pending = new Set(cur.pending.filter((id) => !(sent.has(id) && (sent.get(id) === -1 || versionNow(cur, id) === sent.get(id)))));
  const gone = new Map(cur.gone.map((g) => [g.id, g.at]));
  const out = new Map(cur.entries.map((e) => [e.id, e]));
  const googleDeletes: GoogleLink[] = [];
  const seen = new Set<ID>();
  let changed = false;
  const drop = (e: Entry) => {
    out.delete(e.id);
    if (e.google) googleDeletes.push(e.google);
    changed = true;
  };

  for (const r of rows) {
    if (!r.id) continue;
    seen.add(r.id);
    const v = Number(r.actualizado) || 0;
    const mineNewer = (mine: number) => pending.has(r.id) && mine > v;
    const local = out.get(r.id);

    if (yes(r.borrado)) {
      if (local?.shared && !mineNewer(planVersion(local))) {
        drop(local);
        pending.delete(r.id);
      }
      continue;
    }
    const goneAt = gone.get(r.id);
    if (goneAt !== undefined && !local) {
      if (mineNewer(goneAt)) continue;
      // El otro lo cambió después de que se borrara aquí: vuelve.
      gone.delete(r.id);
      pending.delete(r.id);
    }
    // Aquí se dejó de compartir: esta copia ya es solo de este móvil.
    if (local && !local.shared) continue;
    const fields = readRow(r);
    if (!fields) continue;
    const by = r.por || undefined;

    if (local) {
      if (mineNewer(planVersion(local))) continue;
      pending.delete(r.id);
      const next: Entry = { ...local, ...fields, by, updatedAt: iso(v) };
      if (sameShared(local, next)) continue;
      // Cada uno conserva su aviso, salvo que el plan pase a tener hora (o deje de tenerla).
      if (!!local.time !== !!next.time) {
        const alert = rowAlert(r);
        next.alert = alert === undefined ? defaultAlertFor(fields, defaultAlert) : alert;
      }
      next.dirty = true;
      out.set(r.id, next);
      changed = true;
    } else {
      const alert = rowAlert(r);
      out.set(r.id, {
        id: r.id,
        ...fields,
        alert: alert === undefined ? defaultAlertFor(fields, defaultAlert) : alert,
        shared: true,
        by,
        dirty: true,
        createdAt: iso(v),
        updatedAt: iso(v),
      });
      changed = true;
    }
  }

  if (full) for (const e of [...out.values()]) if (e.shared && !seen.has(e.id) && !pending.has(e.id)) drop(e);

  return {
    entries: [...out.values()],
    pending: [...pending],
    // Los borrados ya enviados no hace falta recordarlos.
    gone: [...gone].filter(([id]) => pending.has(id)).map(([id, at]) => ({ id, at })),
    googleDeletes,
    changed,
  };
}
