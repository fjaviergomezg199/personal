import type { Cadence, FinAccount, FinanceState, ISODate, Movement, Recurring } from '../store/types';
import { isISODate } from './dates';

/*
 * La cuenta conjunta en la hoja compartida: cada movimiento, fijo y parte de la
 * configuración es una fila. Gana el cambio más reciente; lo borrado se envía
 * como borrado para que el otro móvil se entere.
 */

export type Row = Record<string, string>;

export interface SharedRecords {
  Movimientos?: Row[];
  Fijos?: Row[];
  Cuenta?: Row[];
}

const yes = (v: string | undefined) => v === 'true' || v === 'TRUE';

export function movementToRow(m: Movement): Row {
  return {
    id: m.id,
    fecha: m.date,
    importe: String(m.amount),
    tipo: m.kind,
    categoria: m.category,
    concepto: m.note ?? '',
    fijo: m.recurringId ?? '',
    por: m.by ?? '',
    actualizado: String(m.updatedAt),
    borrado: m.deleted ? 'true' : 'false',
  };
}

export function rowToMovement(r: Row): Movement | null {
  if (!r.id || !isISODate(r.fecha)) return null;
  return {
    id: r.id,
    scope: 'hogar',
    kind: r.tipo === 'ingreso' ? 'ingreso' : 'gasto',
    date: r.fecha,
    amount: Math.abs(Number(String(r.importe).replace(',', '.'))) || 0,
    category: r.categoria || (r.tipo === 'ingreso' ? 'otros-ingresos' : 'otros'),
    note: r.concepto || undefined,
    recurringId: r.fijo || undefined,
    by: r.por || undefined,
    updatedAt: Number(r.actualizado) || 0,
    deleted: yes(r.borrado),
  };
}

export function recurringToRow(f: Recurring): Row {
  return {
    id: f.id,
    nombre: f.name,
    importe: String(f.amount),
    tipo: f.kind,
    categoria: f.category,
    dia: String(f.day),
    cada: String(f.every),
    desde: f.from,
    saltos: (f.skips ?? []).join(','),
    activo: f.active ? 'true' : 'false',
    por: f.by ?? '',
    actualizado: String(f.updatedAt),
    borrado: f.deleted ? 'true' : 'false',
  };
}

const CADENCES: Cadence[] = [1, 2, 3, 6, 12];

export function rowToRecurring(r: Row): Recurring | null {
  if (!r.id || !isISODate(r.desde)) return null;
  const every = Number(r.cada) as Cadence;
  return {
    id: r.id,
    scope: 'hogar',
    kind: r.tipo === 'ingreso' ? 'ingreso' : 'gasto',
    name: r.nombre || 'Fijo',
    amount: Math.abs(Number(String(r.importe).replace(',', '.'))) || 0,
    category: r.categoria || 'otros',
    day: Math.min(31, Math.max(1, Number(r.dia) || 1)),
    every: CADENCES.includes(every) ? every : 1,
    from: r.desde,
    skips: r.saltos ? r.saltos.split(',').filter(Boolean) : undefined,
    active: r.activo === '' ? true : yes(r.activo),
    by: r.por || undefined,
    updatedAt: Number(r.actualizado) || 0,
    deleted: yes(r.borrado),
  };
}

type Part = 'periods' | 'budgets' | 'balance';
const PARTS: Part[] = ['periods', 'budgets', 'balance'];

function partData(a: FinAccount, part: Part): unknown {
  if (part === 'periods') return { periodStarts: a.periodStarts, payday: a.payday ?? null };
  if (part === 'budgets') return { budgets: a.budgets, budgetTotal: a.budgetTotal ?? null };
  return { balance: a.balance ?? null };
}

function applyPart(a: FinAccount, part: Part, raw: string): FinAccount {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return a;
  }
  const next = { ...a };
  if (part === 'periods') {
    next.periodStarts = Array.isArray(d.periodStarts) ? (d.periodStarts as unknown[]).filter(isISODate).sort() : a.periodStarts;
    next.payday = typeof d.payday === 'number' && d.payday >= 1 && d.payday <= 31 ? d.payday : undefined;
  } else if (part === 'budgets') {
    const b: Record<string, number> = {};
    for (const [k, v] of Object.entries((d.budgets as Record<string, unknown>) ?? {})) if (typeof v === 'number' && v > 0) b[k] = v;
    next.budgets = b;
    next.budgetTotal = typeof d.budgetTotal === 'number' && d.budgetTotal > 0 ? d.budgetTotal : undefined;
  } else {
    const bal = d.balance as { amount?: unknown; date?: unknown } | null;
    next.balance = bal && typeof bal.amount === 'number' && isISODate(bal.date) ? { amount: bal.amount, date: bal.date as ISODate } : undefined;
  }
  return next;
}

/** Lo pendiente de enviar, y con qué versión se envía cada cosa. */
export function financeOutbox(fin: FinanceState, by?: string): { records: SharedRecords; sent: Map<string, number> } {
  const sent = new Map<string, number>();
  const records: Required<SharedRecords> = { Movimientos: [], Fijos: [], Cuenta: [] };
  for (const key of fin.pending) {
    const [type, id] = [key.slice(0, 1), key.slice(2)];
    if (type === 'm') {
      const m = fin.movements.find((x) => x.id === id && x.scope === 'hogar');
      if (m) {
        records.Movimientos.push(movementToRow(m));
        sent.set(key, m.updatedAt);
      } else sent.set(key, -1);
    } else if (type === 'f') {
      const f = fin.recurring.find((x) => x.id === id && x.scope === 'hogar');
      if (f) {
        records.Fijos.push(recurringToRow(f));
        sent.set(key, f.updatedAt);
      } else sent.set(key, -1);
    } else if (type === 'c' && PARTS.includes(id as Part)) {
      const a = fin.accounts.hogar;
      const stamp = a.stamps[id as Part] ?? 0;
      records.Cuenta.push({ id, datos: JSON.stringify(partData(a, id as Part)), por: by ?? '', actualizado: String(stamp), borrado: 'false' });
      sent.set(key, stamp);
    } else sent.set(key, -1);
  }
  return { records, sent };
}

function versionOf(fin: FinanceState, key: string): number | undefined {
  const [type, id] = [key.slice(0, 1), key.slice(2)];
  if (type === 'm') return fin.movements.find((x) => x.id === id)?.updatedAt;
  if (type === 'f') return fin.recurring.find((x) => x.id === id)?.updatedAt;
  if (type === 'c') return fin.accounts.hogar.stamps[id as Part];
  return undefined;
}

/**
 * Une lo que dice la hoja con lo de este móvil. Lo pendiente y más nuevo de aquí
 * se respeta. Con `full` la hoja trae todo, así que lo que no venga (y no esté
 * pendiente) es que ya no existe.
 */
export function mergeFinance(
  cur: FinanceState,
  sent: Map<string, number>,
  server: SharedRecords,
  full: boolean,
): Pick<FinanceState, 'movements' | 'recurring' | 'pending'> & { hogar: FinAccount } {
  // Lo enviado que no ha vuelto a cambiar aquí ya está en la hoja.
  const pending = new Set(cur.pending.filter((k) => !(sent.has(k) && (sent.get(k) === -1 || versionOf(cur, k) === sent.get(k)))));
  const keep = <T extends { id: string; updatedAt: number; scope: string }>(local: T[], incoming: T[], prefix: string): T[] => {
    const byId = new Map(incoming.map((x) => [x.id, x]));
    const out: T[] = [];
    const seen = new Set<string>();
    for (const l of local) {
      if (l.scope !== 'hogar') {
        out.push(l);
        continue;
      }
      const s = byId.get(l.id);
      seen.add(l.id);
      if (!s) {
        if (!full || pending.has(`${prefix}:${l.id}`)) out.push(l);
        continue;
      }
      if (pending.has(`${prefix}:${l.id}`) && l.updatedAt > s.updatedAt) out.push(l);
      else {
        out.push(s);
        pending.delete(`${prefix}:${l.id}`);
      }
    }
    for (const s of incoming) if (!seen.has(s.id)) out.push(s);
    return out;
  };
  const movements = keep(cur.movements, (server.Movimientos ?? []).map(rowToMovement).filter((m): m is Movement => !!m), 'm');
  const recurring = keep(cur.recurring, (server.Fijos ?? []).map(rowToRecurring).filter((f): f is Recurring => !!f), 'f');

  let hogar = cur.accounts.hogar;
  for (const row of server.Cuenta ?? []) {
    const part = row.id as Part;
    if (!PARTS.includes(part)) continue;
    const stamp = Number(row.actualizado) || 0;
    const mine = hogar.stamps[part] ?? 0;
    if (pending.has(`c:${part}`) && mine > stamp) continue;
    if (stamp >= mine || !pending.has(`c:${part}`)) {
      hogar = { ...applyPart(hogar, part, row.datos), stamps: { ...hogar.stamps, [part]: stamp } };
      pending.delete(`c:${part}`);
    }
  }
  return { movements, recurring, hogar, pending: [...pending] };
}
