import { isColor } from '../lib/colors';
import type { Category, Entry, GoogleLink, ImportBatch } from './types';

type Raw = Record<string, any>;

/**
 * Lo que guardaban las versiones anteriores y esta ya no usa (finanzas,
 * nutrición, peso, listas, objetivos, documentos, menús, hogar compartido…).
 * No se borra: se guarda aparte (ver `stashLegacy` en store.ts).
 */
const LEGACY_KEYS = [
  'areas', 'plan', 'goals', 'docs', 'listItems', 'listPending', 'share', 'planPending', 'planGone',
  'foodLog', 'customFoods', 'nutritionTargets', 'metricTypes', 'metrics', 'finance',
];

const KEEP_KEYS = ['settings', 'birthdays', 'habits', 'habitLog', 'googleEvents', 'googleCalendars', 'notified'];

const OLD_SETTINGS = ['todayLayout', 'dayView', 'simpleToday', 'closeDay', 'weekCardClosed'];

const hasData = (v: unknown) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length);

/** Lo de una versión anterior que ya no se usa (o null si no hay nada). */
export function legacyOf(raw: Raw | undefined): Raw | null {
  if (!raw || (typeof raw.version === 'number' && raw.version >= 5)) return null;
  const out: Raw = {};
  for (const k of LEGACY_KEYS) if (hasData(raw[k])) out[k] = raw[k];
  return Object.keys(out).length ? { ...out, version: raw.version ?? 1 } : null;
}

/**
 * De la versión 4 (y anteriores) a la 5: las áreas que tenían algo pasan a ser
 * categorías (con su nombre, color y emoji), las sesiones de sus planes (running,
 * estudio…) pasan a ser tareas del calendario de esa categoría (cada plan como
 * una importación: no se acumula en «de otros días» y se puede quitar de una
 * vez), y el aviso de «Cerrar el día» desaparece (también de Google Calendar).
 */
export function migrateToV5(raw: Raw): Raw {
  const now = new Date().toISOString();
  const areas: Raw[] = Array.isArray(raw.areas) ? raw.areas : [];
  const plan: Raw[] = Array.isArray(raw.plan) ? raw.plan : [];
  const entries: Raw[] = Array.isArray(raw.entries) ? raw.entries : [];

  const used = new Set<string>([...entries.map((e) => e.areaId), ...plan.map((p) => p.areaId)].filter(Boolean));
  const categories: Category[] = areas
    .filter((a) => a && used.has(a.id))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((a, i) => ({
      id: String(a.id),
      name: String(a.name || 'Categoría'),
      color: isColor(a.color) ? a.color : 'violet',
      ...(a.emoji ? { emoji: String(a.emoji) } : {}),
      order: i,
      createdAt: a.createdAt || now,
    }));
  const catIds = new Set(categories.map((c) => c.id));

  const googleDeletes: GoogleLink[] = Array.isArray(raw.googleDeletes) ? [...raw.googleDeletes] : [];
  const out: Entry[] = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if (e.ritual) {
      if (e.google) googleDeletes.push(e.google);
      continue;
    }
    // Sin área, ni tipo antiguo, ni lo del hogar compartido
    const copy: Raw = { ...e };
    for (const k of ['areaId', 'category', 'shared', 'by', 'ritual']) delete copy[k];
    if (e.areaId && catIds.has(e.areaId)) copy.categoryId = e.areaId;
    out.push(copy as Entry);
  }
  const ids = new Set(out.map((e) => e.id));
  const areaById = new Map(areas.filter(Boolean).map((a) => [String(a.id), a]));
  const batches = new Map<string, ImportBatch>();
  for (const p of plan) {
    if (!p || !p.date) continue;
    const id = ids.has(p.id) ? `${p.id}p` : String(p.id);
    const area = areaById.get(String(p.areaId));
    const batchId = `v4-${p.areaId ?? 'plan'}`;
    const batch = batches.get(batchId) ?? { id: batchId, name: area ? `${area.labels?.plan || 'Plan'} · ${area.name}` : 'Plan anterior', count: 0, at: now };
    batch.count++;
    batches.set(batchId, batch);
    const notes = [p.details, p.result ? `Resultado: ${p.result}` : ''].filter(Boolean).join('\n\n');
    out.push({
      id,
      kind: 'task',
      title: String(p.title || 'Sesión'),
      ...(notes ? { notes } : {}),
      date: p.date,
      ...(p.time ? { time: p.time } : {}),
      repeat: 'none',
      alert: null,
      ...(catIds.has(p.areaId) ? { categoryId: p.areaId } : {}),
      ...(p.done ? { done: true } : {}),
      importId: batchId,
      createdAt: p.createdAt || now,
      updatedAt: p.updatedAt || now,
    });
  }

  const settings: Raw = { ...(raw.settings ?? {}) };
  for (const k of OLD_SETTINGS) delete settings[k];

  const kept: Raw = {};
  for (const k of KEEP_KEYS) if (raw[k] !== undefined) kept[k] = raw[k];
  return { ...kept, version: 5, settings, entries: out, categories, googleDeletes, imports: [...batches.values()] };
}
