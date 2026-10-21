import { useSyncExternalStore } from 'react';
import { addDays, todayISO, weekKey, monthKey } from '../lib/dates';
import { aliasesFor } from '../lib/lifts';
import { DEFAULT_MEALS } from '../lib/importers';
import { files, kv } from './db';
import { templateInfo } from './templates';
import type {
  AppState, Area, Birthday, DocMeta, Entry, Goal, GoogleCalendarInfo, GoogleEvent, GoogleSettings, ID,
  ISODate, Lift, Menu, PlanItem, Settings, TemplateKey,
} from './types';

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
    version: 1,
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
    birthdays: [],
    areas: [],
    plan: [],
    goals: [],
    docs: [],
    googleEvents: [],
    googleCalendars: [],
    googleDeletes: [],
    notified: {},
  };
}

/** Completa campos que falten (datos de versiones anteriores o copias de seguridad). */
export function normalizeState(raw: Partial<AppState> | undefined): AppState {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const settings: Settings = { ...base.settings, ...(raw.settings ?? {}) };
  settings.google = { ...base.settings.google, ...(raw.settings?.google ?? {}) } as GoogleSettings;
  if (!settings.google.clientId) settings.google.clientId = base.settings.google.clientId;
  return {
    ...base,
    ...raw,
    version: 1,
    settings,
    entries: (raw.entries ?? []).map((e) => ({ repeat: 'none', alert: null, ...(e as Partial<Entry>) }) as Entry),
    birthdays: raw.birthdays ?? [],
    areas: (raw.areas ?? []).map((a, i) => ({ showOnToday: true, order: i, modules: [], ...(a as Partial<Area>) }) as Area),
    plan: raw.plan ?? [],
    goals: raw.goals ?? [],
    docs: raw.docs ?? [],
    googleEvents: raw.googleEvents ?? [],
    googleCalendars: raw.googleCalendars ?? [],
    googleDeletes: raw.googleDeletes ?? [],
    notified: raw.notified ?? {},
  };
}

/* ------------------------------------------------------------------ */
/* Estado global + persistencia                                         */
/* ------------------------------------------------------------------ */

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
  state = normalizeState(raw);
  loaded = true;
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
  state = normalizeState(next);
  scheduleSave();
  emit();
  for (const fn of changeListeners) fn();
}

/* ------------------------------------------------------------------ */
/* Acciones                                                             */
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

// --- Recordatorios, planes y tareas ---

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
  update((s) => {
    const e = s.entries.find((x) => x.id === id);
    if (e?.google) s.googleDeletes.push(e.google);
    s.entries = s.entries.filter((x) => x.id !== id);
  });
}

/** Deshacer un borrado. */
export function restoreEntry(entry: Entry) {
  update((s) => {
    if (s.entries.some((e) => e.id === entry.id)) return;
    if (entry.google) s.googleDeletes = s.googleDeletes.filter((d) => d.id !== entry.google!.id);
    s.entries.push({ ...entry, dirty: true });
  });
}

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
      e.dirty = true; // quita el aviso en Google si ya está hecho
    }
    e.updatedAt = nowIso();
  });
}

// --- Cumpleaños ---

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

// --- Áreas ---

export function addArea(template: TemplateKey, overrides: Partial<Area> = {}): ID {
  const t = templateInfo(template);
  const id = uid();
  update((s) => {
    const area: Area = {
      id,
      name: t.name,
      emoji: t.emoji,
      color: t.color,
      template,
      modules: [...t.modules],
      labels: t.labels ? { ...t.labels } : undefined,
      showOnToday: true,
      order: s.areas.length,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...overrides,
    };
    if (area.modules.includes('menu') && !area.menu) area.menu = { meals: [...DEFAULT_MEALS], days: {} };
    if (area.modules.includes('lifts') && !area.lifts) {
      area.lifts = [];
      area.rounding = 2.5;
    }
    s.areas.push(area);
  });
  return id;
}

export function updateArea(id: ID, patch: Partial<Area>) {
  update((s) => {
    const a = s.areas.find((x) => x.id === id);
    if (!a) return;
    Object.assign(a, patch, { updatedAt: nowIso() });
    if (a.modules.includes('menu') && !a.menu) a.menu = { meals: [...DEFAULT_MEALS], days: {} };
    if (a.modules.includes('lifts') && !a.lifts) {
      a.lifts = [];
      a.rounding = a.rounding ?? 2.5;
    }
  }, { silent: true });
}

export function moveArea(id: ID, delta: number) {
  update((s) => {
    const sorted = [...s.areas].sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((a) => a.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((a, k) => {
      const target = s.areas.find((x) => x.id === a.id);
      if (target) target.order = k;
    });
  }, { silent: true });
}

export function deleteArea(id: ID) {
  const docIds = state.docs.filter((d) => d.areaId === id).map((d) => d.id);
  update((s) => {
    for (const e of s.entries) if (e.areaId === id && e.google) s.googleDeletes.push(e.google);
    s.entries = s.entries.filter((e) => e.areaId !== id);
    s.areas = s.areas.filter((a) => a.id !== id);
    s.plan = s.plan.filter((p) => p.areaId !== id);
    s.goals = s.goals.filter((g) => g.areaId !== id);
    s.docs = s.docs.filter((d) => d.areaId !== id);
  });
  // Los ficheros se borran un poco después por si se deshace.
  setTimeout(() => {
    const still = new Set(state.docs.map((d) => d.id));
    for (const d of docIds) if (!still.has(d)) void files.del(d);
  }, 15000);
}

// --- Plan día a día ---

export function addPlanItems(areaId: ID, items: Omit<PlanItem, 'id' | 'areaId' | 'createdAt' | 'updatedAt'>[], replaceFrom?: ISODate) {
  update((s) => {
    if (replaceFrom) s.plan = s.plan.filter((p) => p.areaId !== areaId || p.date < replaceFrom);
    for (const it of items) s.plan.push({ ...it, id: uid(), areaId, createdAt: nowIso(), updatedAt: nowIso() });
  }, { silent: true });
}

export function updatePlanItem(id: ID, patch: Partial<PlanItem>) {
  update((s) => {
    const p = s.plan.find((x) => x.id === id);
    if (p) Object.assign(p, patch, { updatedAt: nowIso() });
  }, { silent: true });
}

export function deletePlanItem(id: ID) {
  update((s) => {
    s.plan = s.plan.filter((x) => x.id !== id);
  }, { silent: true });
}

export function restorePlanItems(items: PlanItem[]) {
  update((s) => {
    const ids = new Set(s.plan.map((p) => p.id));
    for (const it of items) if (!ids.has(it.id)) s.plan.push(it);
  }, { silent: true });
}

export function clearPlan(areaId: ID) {
  update((s) => {
    s.plan = s.plan.filter((p) => p.areaId !== areaId);
  }, { silent: true });
}

// --- Objetivos ---

export function periodKey(goal: Pick<Goal, 'period'>, date: ISODate = todayISO()): string {
  if (goal.period === 'week') return weekKey(date);
  if (goal.period === 'month') return monthKey(date);
  return 'total';
}

export function goalValue(goal: Goal, date: ISODate = todayISO()): number {
  return goal.progress[periodKey(goal, date)] ?? 0;
}

export function addGoal(input: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'progress'>): ID {
  const id = uid();
  update((s) => {
    s.goals.push({ ...input, id, progress: {}, createdAt: nowIso(), updatedAt: nowIso() });
  }, { silent: true });
  return id;
}

export function updateGoal(id: ID, patch: Partial<Goal>) {
  update((s) => {
    const g = s.goals.find((x) => x.id === id);
    if (g) Object.assign(g, patch, { updatedAt: nowIso() });
  }, { silent: true });
}

export function bumpGoal(id: ID, delta: number, date: ISODate = todayISO()) {
  update((s) => {
    const g = s.goals.find((x) => x.id === id);
    if (!g) return;
    const key = periodKey(g, date);
    const next = Math.max(0, Math.round(((g.progress[key] ?? 0) + delta) * 100) / 100);
    g.progress = { ...g.progress, [key]: next };
    g.updatedAt = nowIso();
  }, { silent: true });
}

export function deleteGoal(id: ID) {
  update((s) => {
    s.goals = s.goals.filter((g) => g.id !== id);
  }, { silent: true });
}

export function restoreGoal(goal: Goal) {
  update((s) => {
    if (!s.goals.some((g) => g.id === goal.id)) s.goals.push(goal);
  }, { silent: true });
}

// --- Documentos ---

export async function addDoc(meta: Omit<DocMeta, 'id' | 'createdAt'>, blob?: Blob): Promise<ID> {
  const id = uid();
  if (blob) await files.put(id, blob);
  update((s) => {
    s.docs.push({ ...meta, id, createdAt: nowIso() });
  }, { silent: true });
  return id;
}

export function updateDoc(id: ID, patch: Partial<DocMeta>) {
  update((s) => {
    const d = s.docs.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
  }, { silent: true });
}

export function restoreDoc(doc: DocMeta) {
  update((s) => {
    if (!s.docs.some((d) => d.id === doc.id)) s.docs.push(doc);
  }, { silent: true });
}

export function deleteDoc(id: ID) {
  update((s) => {
    s.docs = s.docs.filter((d) => d.id !== id);
  }, { silent: true });
  setTimeout(() => {
    if (!state.docs.some((d) => d.id === id)) void files.del(id);
  }, 15000);
}

// --- Menú y RM ---

export function setMenu(areaId: ID, menu: Menu) {
  updateArea(areaId, { menu });
}

export function setMeal(areaId: ID, day: number, meal: string, text: string) {
  update((s) => {
    const a = s.areas.find((x) => x.id === areaId);
    if (!a) return;
    const menu = a.menu ?? { meals: [...DEFAULT_MEALS], days: {} };
    const dayMenu = { ...(menu.days[day] ?? {}) };
    if (text.trim()) dayMenu[meal] = text.trim();
    else delete dayMenu[meal];
    menu.days = { ...menu.days, [day]: dayMenu };
    a.menu = menu;
  }, { silent: true });
}

export function saveLift(areaId: ID, lift: Partial<Lift> & { name: string; rm: number }) {
  update((s) => {
    const a = s.areas.find((x) => x.id === areaId);
    if (!a) return;
    a.lifts = a.lifts ?? [];
    const today = todayISO();
    const existing = lift.id ? a.lifts.find((l) => l.id === lift.id) : undefined;
    if (existing) {
      if (existing.rm !== lift.rm) existing.history = [...existing.history, { date: today, rm: existing.rm }].slice(-20);
      existing.name = lift.name;
      existing.rm = lift.rm;
      existing.aliases = aliasesFor(lift.name);
      existing.updatedAt = nowIso();
    } else {
      a.lifts.push({ id: uid(), name: lift.name, rm: lift.rm, aliases: aliasesFor(lift.name), updatedAt: nowIso(), history: [] });
    }
  }, { silent: true });
}

export function deleteLift(areaId: ID, liftId: ID) {
  update((s) => {
    const a = s.areas.find((x) => x.id === areaId);
    if (a?.lifts) a.lifts = a.lifts.filter((l) => l.id !== liftId);
  }, { silent: true });
}

// --- Google (caché) ---

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
