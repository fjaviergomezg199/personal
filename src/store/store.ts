import { useSyncExternalStore } from 'react';
import { isColor } from '../lib/colors';
import { fold } from '../lib/quickParse';
import { addDays, todayISO } from '../lib/dates';
import { kv } from './db';
import { legacyOf, migrateToV5 } from './migrate';
import type { AppState, Birthday, Category, ColorKey, Entry, GoogleCalendarInfo, GoogleEvent, GoogleSettings, Habit, ID, ISODate, Settings } from './types';

export function uid(): ID {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
}

const nowIso = () => new Date().toISOString();

export function createInitialState(): AppState {
  return {
    version: 5,
    settings: {
      name: '',
      theme: 'auto',
      defaultAlert: 15,
      birthdayAlert: 900,
      notifications: false,
      google: {
        clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '',
        writeCalendarId: 'primary',
        readCalendarIds: ['primary'],
        pushEntries: true,
        pushBirthdays: true,
        autoReconnect: true,
      },
      onboarded: false,
    },
    entries: [],
    categories: [],
    birthdays: [],
    habits: [],
    habitLog: {},
    imports: [],
    googleEvents: [],
    googleCalendars: [],
    googleDeletes: [],
    notified: {},
  };
}

/** Completa lo que falte y convierte los datos de versiones anteriores (o de copias de seguridad). */
export function normalizeState(input: Partial<AppState> | undefined): AppState {
  const base = createInitialState();
  if (!input || typeof input !== 'object') return base;
  const v = (input as { version?: unknown }).version;
  // Sin versión: es de antes si aún tiene áreas o planes
  const old = typeof v === 'number' ? v < 5 : 'areas' in input || 'plan' in input;
  const raw = old ? (migrateToV5(input) as Partial<AppState>) : input;
  const settings: Settings = { ...base.settings, ...(raw.settings ?? {}) };
  settings.google = { ...base.settings.google, ...(raw.settings?.google ?? {}) } as GoogleSettings;
  if (!settings.google.clientId) settings.google.clientId = base.settings.google.clientId;
  return {
    version: 5,
    settings,
    entries: (raw.entries ?? []).map((e) => ({ repeat: 'none', alert: null, ...(e as Partial<Entry>) }) as Entry),
    categories: (raw.categories ?? []).map((c, i) => ({ ...c, order: c.order ?? i, color: isColor(c.color) ? c.color : 'violet' })),
    birthdays: raw.birthdays ?? [],
    habits: raw.habits ?? [],
    habitLog: raw.habitLog ?? {},
    imports: raw.imports ?? [],
    googleEvents: raw.googleEvents ?? [],
    googleCalendars: raw.googleCalendars ?? [],
    googleDeletes: raw.googleDeletes ?? [],
    notified: raw.notified ?? {},
  };
}

/** Lo que una versión anterior guardaba y esta ya no usa: se guarda aparte una vez (no se pierde). */
export async function stashLegacy(raw: unknown): Promise<void> {
  const legacy = legacyOf(raw as Record<string, unknown> | undefined);
  if (!legacy) return;
  try {
    if (!(await kv.get('legacy-v4'))) await kv.set('legacy-v4', { ...legacy, savedAt: nowIso() });
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

let state: AppState = createInitialState();
let loaded = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

function emit() {
  for (const l of listeners) l();
}

export async function loadState(): Promise<AppState> {
  const raw = await kv.get<AppState>('state');
  await stashLegacy(raw);
  state = normalizeState(raw);
  loaded = true;
  // Datos de una versión anterior: se guardan ya convertidos.
  if (raw && raw.version !== state.version) scheduleSave();
  emit();
  return state;
}

export function flushSave(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!loaded) return Promise.resolve();
  return kv.set('state', state);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), 250);
}

const changeListeners = new Set<() => void>();
/** Avisa (con retardo) de cambios en datos que se sincronizan con Google. */
export function onDataChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Aplica cambios sobre una copia del estado. */
export function update(mutator: (draft: AppState) => void, opts: { silent?: boolean } = {}): void {
  const draft = structuredClone(state);
  mutator(draft);
  state = draft;
  scheduleSave();
  emit();
  if (!opts.silent) for (const fn of changeListeners) fn();
}

/** Sustituye todo el estado (restaurar copia, deshacer). */
export function replaceState(next: AppState): void {
  void stashLegacy(next);
  state = normalizeState(next);
  scheduleSave();
  emit();
  for (const fn of changeListeners) fn();
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                              */
/* ------------------------------------------------------------------ */

export function updateSettings(patch: Partial<Settings>) {
  update((s) => {
    s.settings = { ...s.settings, ...patch };
  }, { silent: true });
}

export function updateGoogle(patch: Partial<GoogleSettings>) {
  update((s) => {
    s.settings.google = { ...s.settings.google, ...patch };
  }, { silent: true });
}

/* ------------------------------------------------------------------ */
/* Planes, tareas y recordatorios                                       */
/* ------------------------------------------------------------------ */

export type EntryInput = Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>;

export function addEntry(input: EntryInput): ID {
  const id = uid();
  update((s) => {
    s.entries.push({ ...input, id, createdAt: nowIso(), updatedAt: nowIso(), dirty: true });
  });
  return id;
}

export function updateEntry(id: ID, patch: Partial<Entry>) {
  update((s) => {
    const e = s.entries.find((x) => x.id === id);
    if (e) Object.assign(e, patch, { updatedAt: nowIso(), dirty: true });
  });
}

export function deleteEntry(id: ID) {
  deleteEntries([id]);
}

export function deleteEntries(ids: ID[]) {
  const set = new Set(ids);
  update((s) => {
    for (const e of s.entries) if (set.has(e.id) && e.google) s.googleDeletes.push(e.google);
    s.entries = s.entries.filter((x) => !set.has(x.id));
  });
}

/** Deshacer un borrado. */
export function restoreEntries(entries: Entry[]) {
  update((s) => {
    for (const entry of entries) {
      if (s.entries.some((e) => e.id === entry.id)) continue;
      if (entry.google) s.googleDeletes = s.googleDeletes.filter((d) => d.id !== entry.google!.id);
      s.entries.push({ ...entry, dirty: true });
    }
  });
}

export const restoreEntry = (entry: Entry) => restoreEntries([entry]);

export function toggleEntryDone(id: ID, date?: ISODate) {
  update((s) => {
    const e = s.entries.find((x) => x.id === id);
    if (!e) return;
    if (e.repeat !== 'none' && date) {
      const set = new Set(e.doneDates ?? []);
      if (set.has(date)) set.delete(date);
      else set.add(date);
      // Solo guardamos los últimos meses
      const limit = addDays(todayISO(), -120);
      e.doneDates = [...set].filter((d) => d >= limit).sort();
    } else {
      e.done = !e.done;
      e.doneAt = e.done ? nowIso() : undefined;
      e.dirty = true; // quita el aviso en Google si ya está hecho
    }
    e.updatedAt = nowIso();
  });
}

/* ------------------------------------------------------------------ */
/* Categorías                                                           */
/* ------------------------------------------------------------------ */

const sameName = (a: string, b: string) => fold(a).replace(/\s+/g, '') === fold(b).replace(/\s+/g, '');

/** La categoría con ese nombre (sin mirar mayúsculas, tildes ni espacios). */
export function findCategory(s: AppState, name: string): Category | undefined {
  return s.categories.find((c) => sameName(c.name, name));
}

/** Crea una categoría (si ya hay una con ese nombre, devuelve esa). */
export function addCategory(name: string, color: ColorKey, emoji?: string): ID {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  const existing = findCategory(state, clean);
  if (existing) return existing.id;
  const id = `c${uid()}`;
  update((s) => {
    s.categories.push({ id, name: clean, color, ...(emoji ? { emoji } : {}), order: s.categories.length, createdAt: nowIso() });
  }, { silent: true });
  return id;
}

export function updateCategory(id: ID, patch: Partial<Pick<Category, 'name' | 'color' | 'emoji'>>) {
  const colorChanged = patch.color !== undefined && state.categories.find((c) => c.id === id)?.color !== patch.color;
  update((s) => {
    const c = s.categories.find((x) => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    if (patch.name !== undefined) c.name = patch.name.trim().replace(/\s+/g, ' ').slice(0, 40) || c.name;
    // El color también va a Google Calendar
    if (colorChanged) for (const e of s.entries) if (e.categoryId === id && e.google) e.dirty = true;
  }, { silent: !colorChanged });
}

/** Borra la categoría; lo que tenía se queda, sin categoría. Devuelve lo necesario para deshacerlo. */
export function deleteCategory(id: ID): { category?: Category; entryIds: ID[] } {
  const category = state.categories.find((c) => c.id === id);
  const entryIds = state.entries.filter((e) => e.categoryId === id).map((e) => e.id);
  update((s) => {
    s.categories = s.categories.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i }));
    for (const e of s.entries) {
      if (e.categoryId !== id) continue;
      delete e.categoryId;
      if (e.google) e.dirty = true;
    }
    s.settings.hiddenCategories = s.settings.hiddenCategories?.filter((x) => x !== id);
  });
  return { category, entryIds };
}

export function restoreCategory(category: Category, entryIds: ID[]) {
  update((s) => {
    if (!s.categories.some((c) => c.id === category.id)) {
      s.categories.splice(Math.min(category.order, s.categories.length), 0, category);
      s.categories.forEach((c, i) => (c.order = i));
    }
    const ids = new Set(entryIds);
    for (const e of s.entries) {
      if (!ids.has(e.id)) continue;
      e.categoryId = category.id;
      if (e.google) e.dirty = true;
    }
  });
}

export function moveCategory(id: ID, delta: number) {
  update((s) => {
    const list = [...s.categories].sort((a, b) => a.order - b.order);
    const i = list.findIndex((c) => c.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    s.categories = list.map((c, k) => ({ ...c, order: k }));
  }, { silent: true });
}

/** Mostrar u ocultar una categoría en el calendario. */
export function toggleCategoryHidden(id: ID) {
  const hidden = new Set(state.settings.hiddenCategories ?? []);
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  updateSettings({ hiddenCategories: [...hidden] });
}

/* ------------------------------------------------------------------ */
/* Importar al calendario                                               */
/* ------------------------------------------------------------------ */

/** Mete en el calendario lo importado de un JSON (todo junto se puede deshacer). */
export function importEntries(name: string, inputs: EntryInput[]): { batchId: ID; ids: ID[] } {
  const batchId = `i${uid()}`;
  const ids = inputs.map(() => uid());
  update((s) => {
    inputs.forEach((input, i) => s.entries.push({ ...input, id: ids[i], importId: batchId, createdAt: nowIso(), updatedAt: nowIso(), dirty: true }));
    s.imports.push({ id: batchId, name: name.trim().slice(0, 80) || 'Importación', count: inputs.length, at: nowIso() });
  });
  return { batchId, ids };
}

/** Quita del calendario todo lo de una importación. */
export function undoImport(batchId: ID) {
  update((s) => {
    for (const e of s.entries) if (e.importId === batchId && e.google) s.googleDeletes.push(e.google);
    s.entries = s.entries.filter((e) => e.importId !== batchId);
    s.imports = s.imports.filter((b) => b.id !== batchId);
  });
}

/* ------------------------------------------------------------------ */
/* Cumpleaños                                                           */
/* ------------------------------------------------------------------ */

export function addBirthday(input: Omit<Birthday, 'id' | 'createdAt' | 'updatedAt'>): ID {
  const id = uid();
  update((s) => {
    s.birthdays.push({ ...input, id, createdAt: nowIso(), updatedAt: nowIso(), dirty: true });
  });
  return id;
}

export function updateBirthday(id: ID, patch: Partial<Birthday>) {
  update((s) => {
    const b = s.birthdays.find((x) => x.id === id);
    if (b) Object.assign(b, patch, { updatedAt: nowIso(), dirty: true });
  });
}

export function deleteBirthday(id: ID) {
  update((s) => {
    const b = s.birthdays.find((x) => x.id === id);
    if (b?.google) s.googleDeletes.push(b.google);
    s.birthdays = s.birthdays.filter((x) => x.id !== id);
  });
}

export function restoreBirthday(b: Birthday) {
  update((s) => {
    if (s.birthdays.some((x) => x.id === b.id)) return;
    if (b.google) s.googleDeletes = s.googleDeletes.filter((d) => d.id !== b.google!.id);
    s.birthdays.push({ ...b, dirty: true });
  });
}

/* ------------------------------------------------------------------ */
/* Google (caché) y avisos                                              */
/* ------------------------------------------------------------------ */

export function setGoogleData(events: GoogleEvent[] | null, calendars: GoogleCalendarInfo[] | null) {
  update((s) => {
    if (events) s.googleEvents = events;
    if (calendars) s.googleCalendars = calendars;
  }, { silent: true });
}

export function markNotified(keys: string[]) {
  if (!keys.length) return;
  update((s) => {
    const now = Date.now();
    for (const k of keys) s.notified[k] = now;
    // Limpieza: fuera lo de hace más de 40 días
    for (const [k, t] of Object.entries(s.notified)) if (now - t > 40 * 86400000) delete s.notified[k];
  }, { silent: true });
}

/* ------------------------------------------------------------------ */
/* Hábitos                                                              */
/* ------------------------------------------------------------------ */

export type HabitInput = Omit<Habit, 'id' | 'createdAt' | 'order'> & { id?: ID };

export function saveHabit(input: HabitInput): ID {
  const id = input.id ?? `H${uid()}`;
  update((s) => {
    const i = s.habits.findIndex((h) => h.id === id);
    if (i >= 0) s.habits[i] = { ...s.habits[i], ...input, id };
    else s.habits.push({ ...input, id, createdAt: nowIso(), order: s.habits.length });
  }, { silent: true });
  return id;
}

export function deleteHabit(id: ID) {
  update((s) => {
    s.habits = s.habits.filter((h) => h.id !== id);
    delete s.habitLog[id];
  }, { silent: true });
}

export function restoreHabit(h: Habit, log: Record<ISODate, number> | undefined) {
  update((s) => {
    if (!s.habits.some((x) => x.id === h.id)) s.habits.push(h);
    if (log) s.habitLog[h.id] = log;
  }, { silent: true });
}

/** Cuántas veces se ha hecho un hábito un día (0 lo borra). */
export function setHabitCount(id: ID, date: ISODate, count: number) {
  update((s) => {
    const log = { ...(s.habitLog[id] ?? {}) };
    if (count > 0) log[date] = count;
    else delete log[date];
    s.habitLog[id] = log;
  }, { silent: true });
}

export function moveHabit(id: ID, delta: number) {
  update((s) => {
    const list = [...s.habits].sort((a, b) => a.order - b.order);
    const i = list.findIndex((h) => h.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((h, k) => {
      const t = s.habits.find((x) => x.id === h.id);
      if (t) t.order = k;
    });
  }, { silent: true });
}
