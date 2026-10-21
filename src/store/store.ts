import { useSyncExternalStore } from 'react';
import { addDays, todayISO, weekKey, monthKey } from '../lib/dates';
import { aliasesFor } from '../lib/lifts';
import { sameItem } from '../lib/menuShopping';
import { planVersion, sameShared } from '../lib/planSync';
import { DEFAULT_MEALS } from '../lib/importers';
import { files, kv } from './db';
import { templateInfo } from './templates';
import type {
  AppState, Area, Birthday, Habit, CustomFood, DocMeta, Entry, FinAccount, FinanceState, FinScope, FoodLogItem, Goal, GoogleCalendarInfo,
  GoogleEvent, GoogleLink, GoogleSettings, ID, ISODate, Lift, ListItem, ListKey, Menu, MetricEntry, MetricType, ModuleKey, Movement,
  NutritionTargets, PlanItem, Recurring, Settings, ShareConfig, TemplateKey,
} from './types';

export function uid(): ID {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
}

const nowIso = () => new Date().toISOString();

export const DEFAULT_METRICS: MetricType[] = [{ id: 'peso', name: 'Peso', unit: 'kg', decimals: 1 }];

const emptyAccount = (): FinAccount => ({ periodStarts: [], budgets: {}, stamps: {} });

export function emptyFinance(): FinanceState {
  return { movements: [], recurring: [], accounts: { personal: emptyAccount(), hogar: emptyAccount() }, pending: [] };
}

function normalizeFinance(raw: Partial<FinanceState> | undefined): FinanceState {
  const base = emptyFinance();
  if (!raw || typeof raw !== 'object') return base;
  const acc = (a: Partial<FinAccount> | undefined): FinAccount => ({ ...emptyAccount(), ...(a ?? {}), budgets: { ...(a?.budgets ?? {}) }, stamps: { ...(a?.stamps ?? {}) } });
  return {
    movements: raw.movements ?? [],
    recurring: raw.recurring ?? [],
    accounts: { personal: acc(raw.accounts?.personal), hogar: acc(raw.accounts?.hogar) },
    pending: raw.pending ?? [],
  };
}

export function createInitialState(): AppState {
  return {
    version: 4,
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
    listItems: [],
    listPending: [],
    planPending: [],
    planGone: [],
    foodLog: [],
    customFoods: [],
    nutritionTargets: {},
    metricTypes: DEFAULT_METRICS.map((m) => ({ ...m })),
    metrics: [],
    finance: emptyFinance(),
    habits: [],
    habitLog: {},
  };
}

/** Completa campos que falten (datos de versiones anteriores o copias de seguridad). */
export function normalizeState(raw: Partial<AppState> | undefined): AppState {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const settings: Settings = { ...base.settings, ...(raw.settings ?? {}) };
  settings.google = { ...base.settings.google, ...(raw.settings?.google ?? {}) } as GoogleSettings;
  if (!settings.google.clientId) settings.google.clientId = base.settings.google.clientId;
  const s: AppState = {
    ...base,
    ...raw,
    version: 4,
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
    listItems: raw.listItems ?? [],
    listPending: raw.listPending ?? [],
    planPending: raw.planPending ?? [],
    planGone: raw.planGone ?? [],
    foodLog: raw.foodLog ?? [],
    customFoods: raw.customFoods ?? [],
    nutritionTargets: raw.nutritionTargets ?? {},
    metricTypes: raw.metricTypes?.length ? raw.metricTypes : DEFAULT_METRICS.map((m) => ({ ...m })),
    metrics: raw.metrics ?? [],
    finance: normalizeFinance(raw.finance),
    habits: raw.habits ?? [],
    habitLog: raw.habitLog ?? {},
  };
  if ((raw.version ?? 1) < 2) migrateToV2(s);
  if ((raw.version ?? 1) < 3) migrateToV3(s);
  return s;
}

function insertModule(mods: ModuleKey[], m: ModuleKey, after?: ModuleKey) {
  if (mods.includes(m)) return;
  const i = after ? mods.indexOf(after) : -1;
  if (i === -1) mods.unshift(m);
  else mods.splice(i + 1, 0, m);
}

/**
 * v1 → v2: la lista de la compra (y las tareas de casa) pasan a ser listas
 * propias que se pueden compartir; Nutrición gana «Macros» y «Peso».
 */
function migrateToV2(s: AppState) {
  const now = Date.now();
  for (const a of s.areas) {
    const shopping = a.template === 'nutrition' && a.modules.includes('tasks') && (!a.labels?.tasks || a.labels.tasks === 'Lista de la compra');
    const home = a.template === 'home' && a.modules.includes('tasks');
    if (shopping || home) {
      const list: ListKey = shopping ? 'compra' : 'casa';
      const own = s.entries.filter((e) => e.areaId === a.id && e.kind !== 'event' && !e.date && e.repeat === 'none');
      for (const e of own) s.listItems.push({ id: `L${e.id}`, list, text: e.title, done: !!e.done, updatedAt: now });
      const moved = new Set(own.map((e) => e.id));
      s.entries = s.entries.filter((e) => !moved.has(e.id));
      const rest = s.entries.some((e) => e.areaId === a.id && e.kind !== 'event');
      if (shopping) {
        a.modules = a.modules.flatMap((m) => (m === 'tasks' ? (rest ? (['shopping', 'tasks'] as ModuleKey[]) : (['shopping'] as ModuleKey[])) : [m]));
        if (a.labels) {
          delete a.labels.tasks;
          a.labels.shopping = 'Lista de la compra';
        }
      } else {
        insertModule(a.modules, 'chores');
        insertModule(a.modules, 'shopping');
        if (!rest) a.modules = a.modules.filter((m) => m !== 'tasks');
        if (a.labels?.tasks === 'Tareas de casa') delete a.labels.tasks;
      }
    }
    if (a.template === 'nutrition') {
      insertModule(a.modules, 'diary', 'menu');
      insertModule(a.modules, 'metrics', 'diary');
    }
  }
}

/** v2 → v3: llegan las finanzas (un área «Finanzas» y la cuenta conjunta en Hogar). */
function migrateToV3(s: AppState) {
  for (const a of s.areas) if (a.template === 'home') insertModule(a.modules, 'jointMoney', 'chores');
  if (s.settings.onboarded && !s.areas.some((a) => a.modules.includes('money'))) s.areas.push(newArea('money', s.areas.length));
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
  // Datos de una versión anterior: se guardan ya convertidos (así las áreas nuevas no cambian de id).
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

// Los planes en pareja se apuntan para enviarlos a la hoja compartida (y avisar al otro móvil).
function planChanged(s: AppState, id: ID) {
  if (!s.planPending.includes(id)) s.planPending.push(id);
}

const shareListeners = () => {
  for (const fn of listListeners) fn();
};

export function addEntry(input: EntryInput): ID {
  const id = uid();
  update((s) => {
    s.entries.push({ ...input, id, createdAt: nowIso(), updatedAt: nowIso(), dirty: true, ...(input.shared ? { by: me() } : {}) });
    if (input.shared) planChanged(s, id);
  });
  if (input.shared) shareListeners();
  return id;
}

export function updateEntry(id: ID, patch: Partial<Entry>) {
  let shared = false;
  update((s) => {
    const e = s.entries.find((x) => x.id === id);
    if (!e) return;
    const before = { ...e };
    Object.assign(e, patch, { updatedAt: nowIso(), dirty: true });
    // El aviso y el área son de cada uno: solo se envía si cambia lo que ven los dos.
    if ((before.shared || e.shared) && (!!before.shared !== !!e.shared || !sameShared(before, e))) {
      if (e.shared) e.by = me();
      planChanged(s, id);
      shared = true;
    }
  });
  if (shared) shareListeners();
}

/** Quita elementos de la agenda; los compartidos se borran también en el otro móvil. */
function removeEntries(s: AppState, ids: Set<ID>) {
  const t = Date.now();
  for (const e of s.entries) {
    if (!ids.has(e.id)) continue;
    if (e.google) s.googleDeletes.push(e.google);
    if (e.shared) {
      s.planGone = [...s.planGone.filter((g) => g.id !== e.id), { id: e.id, at: Math.max(t, planVersion(e) + 1) }];
      planChanged(s, e.id);
    }
  }
  s.entries = s.entries.filter((x) => !ids.has(x.id));
}

export function deleteEntry(id: ID) {
  deleteEntries([id]);
}

export function deleteEntries(ids: ID[]) {
  const set = new Set(ids);
  const shared = state.entries.some((e) => set.has(e.id) && e.shared);
  update((s) => removeEntries(s, set));
  if (shared) shareListeners();
}

/** Deshacer un borrado. */
export function restoreEntry(entry: Entry) {
  update((s) => {
    if (s.entries.some((e) => e.id === entry.id)) return;
    if (entry.google) s.googleDeletes = s.googleDeletes.filter((d) => d.id !== entry.google!.id);
    if (entry.shared) {
      // Más nuevo que el borrado, por si ya había llegado a la hoja.
      const gone = s.planGone.find((g) => g.id === entry.id)?.at ?? 0;
      s.planGone = s.planGone.filter((g) => g.id !== entry.id);
      s.entries.push({ ...entry, dirty: true, by: me(), updatedAt: new Date(Math.max(Date.now(), gone + 1)).toISOString() });
      planChanged(s, entry.id);
    } else s.entries.push({ ...entry, dirty: true });
  });
  if (entry.shared) shareListeners();
}

export function toggleEntryDone(id: ID, date?: ISODate) {
  const shared = !!state.entries.find((x) => x.id === id)?.shared;
  update((s) => {
    const e = s.entries.find((x) => x.id === id);
    if (!e) return;
    if (e.shared) {
      e.by = me();
      planChanged(s, id);
    }
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
  if (shared) shareListeners();
}

/** Resultado de sincronizar los planes en pareja con la hoja. */
export function applyPlanSync(r: { entries: Entry[]; pending: ID[]; gone: { id: ID; at: number }[]; googleDeletes: GoogleLink[]; changed: boolean }) {
  update(
    (s) => {
      s.entries = r.entries;
      s.planPending = r.pending;
      s.planGone = r.gone;
      s.googleDeletes.push(...r.googleDeletes);
    },
    // Lo que llega del otro móvil va también a Google Calendar.
    { silent: !r.changed },
  );
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

function newArea(template: TemplateKey, order: number, overrides: Partial<Area> = {}): Area {
  const t = templateInfo(template);
  const area: Area = {
    id: uid(),
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    template,
    modules: [...t.modules],
    labels: t.labels ? { ...t.labels } : undefined,
    showOnToday: true,
    order,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
  if (area.modules.includes('menu') && !area.menu) area.menu = { meals: [...DEFAULT_MEALS], days: {} };
  if (area.modules.includes('lifts') && !area.lifts) {
    area.lifts = [];
    area.rounding = 2.5;
  }
  return area;
}

export function addArea(template: TemplateKey, overrides: Partial<Area> = {}): ID {
  let id = '';
  update((s) => {
    const area = newArea(template, s.areas.length, overrides);
    id = area.id;
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
    // Los planes en pareja no se borran: el área es solo de este móvil.
    for (const e of s.entries) if (e.areaId === id && e.shared) delete e.areaId;
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

/* ------------------------------------------------------------------ */
/* Listas del hogar (compra y tareas), compartibles                     */
/* ------------------------------------------------------------------ */

const listListeners = new Set<() => void>();
/** Avisa de cambios hechos aquí en las listas (para enviarlos al hogar compartido). */
export function onListChange(fn: () => void): () => void {
  listListeners.add(fn);
  return () => listListeners.delete(fn);
}

const me = () => state.settings.name.trim() || undefined;

function markPending(s: AppState, id: ID) {
  if (!s.listPending.includes(id)) s.listPending.push(id);
}

function listUpdate(mutator: (s: AppState) => void) {
  update(mutator, { silent: true });
  for (const fn of listListeners) fn();
}

const sameText = sameItem;

/**
 * Añade a la lista. Lo que ya estaba no se duplica: si estaba en el carro vuelve
 * a la lista, y si trae cantidad nueva se actualiza. Devuelve lo que ya estaba.
 */
export function addListItems(list: ListKey, items: { text: string; qty?: string }[]): { ids: ID[]; repeated: string[] } {
  const ids: ID[] = [];
  const repeated: string[] = [];
  listUpdate((s) => {
    const t = Date.now();
    for (const it of items) {
      const prev = s.listItems.find((x) => x.list === list && !x.deleted && sameText(x.text, it.text));
      if (prev) {
        if (!prev.done) repeated.push(prev.text);
        if (prev.done || (it.qty && it.qty !== prev.qty)) {
          Object.assign(prev, { done: false, qty: it.qty ?? prev.qty, updatedAt: t, by: me() });
          markPending(s, prev.id);
        }
        ids.push(prev.id);
        continue;
      }
      const id = `L${uid()}`;
      ids.push(id);
      s.listItems.push({ id, list, text: it.text, qty: it.qty, done: false, updatedAt: t, by: me() });
      markPending(s, id);
    }
  });
  return { ids, repeated };
}

export function updateListItem(id: ID, patch: Partial<Pick<ListItem, 'text' | 'qty' | 'done'>>) {
  listUpdate((s) => {
    const it = s.listItems.find((x) => x.id === id);
    if (!it) return;
    Object.assign(it, patch, { updatedAt: Date.now(), by: me() });
    markPending(s, id);
  });
}

export function deleteListItems(ids: ID[]) {
  const set = new Set(ids);
  listUpdate((s) => {
    const t = Date.now();
    for (const it of s.listItems) {
      if (!set.has(it.id)) continue;
      it.deleted = true;
      it.updatedAt = t;
      it.by = me();
      markPending(s, it.id);
    }
  });
}

export function restoreListItems(ids: ID[]) {
  const set = new Set(ids);
  listUpdate((s) => {
    const t = Date.now();
    for (const it of s.listItems) {
      if (!set.has(it.id)) continue;
      it.deleted = false;
      it.updatedAt = t;
      markPending(s, it.id);
    }
  });
}

export function setShare(share: ShareConfig | undefined) {
  update((s) => {
    s.share = share;
    if (!share) return;
    // Al empezar a compartir se envía todo lo que había en este móvil (también si es otra hoja).
    s.listPending = s.listItems.map((i) => i.id);
    for (const m of s.finance.movements) if (m.scope === 'hogar') finShared(s, 'hogar', `m:${m.id}`);
    for (const f of s.finance.recurring) if (f.scope === 'hogar') finShared(s, 'hogar', `f:${f.id}`);
    const stamps = s.finance.accounts.hogar.stamps;
    for (const part of ['periods', 'budgets', 'balance'] as const) if (stamps[part]) finShared(s, 'hogar', `c:${part}`);
    for (const e of s.entries) if (e.shared) planChanged(s, e.id);
    for (const g of s.planGone) planChanged(s, g.id);
  }, { silent: true });
}

export function patchShare(patch: Partial<ShareConfig>) {
  update((s) => {
    if (s.share) s.share = { ...s.share, ...patch };
  }, { silent: true });
}

/** Resultado de una sincronización: nuevas listas y lo que sigue pendiente. */
export function applySyncResult(items: ListItem[], pending: ID[], patch: Partial<ShareConfig>) {
  update((s) => {
    s.listItems = items;
    s.listPending = pending;
    if (s.share) s.share = { ...s.share, ...patch };
  }, { silent: true });
}

/* ------------------------------------------------------------------ */
/* Nutrición                                                            */
/* ------------------------------------------------------------------ */

export function addFoodLog(items: Omit<FoodLogItem, 'id' | 'createdAt'>[]): ID[] {
  const ids: ID[] = [];
  update((s) => {
    for (const it of items) {
      const id = uid();
      ids.push(id);
      s.foodLog.push({ ...it, id, createdAt: nowIso() });
    }
  }, { silent: true });
  return ids;
}

export function updateFoodLog(id: ID, patch: Partial<FoodLogItem>) {
  update((s) => {
    const it = s.foodLog.find((x) => x.id === id);
    if (it) Object.assign(it, patch);
  }, { silent: true });
}

export function deleteFoodLog(ids: ID[]) {
  const set = new Set(ids);
  update((s) => {
    s.foodLog = s.foodLog.filter((x) => !set.has(x.id));
  }, { silent: true });
}

export function restoreFoodLog(items: FoodLogItem[]) {
  update((s) => {
    const have = new Set(s.foodLog.map((x) => x.id));
    for (const it of items) if (!have.has(it.id)) s.foodLog.push(it);
  }, { silent: true });
}

export function setNutritionTargets(t: NutritionTargets) {
  update((s) => {
    s.nutritionTargets = t;
  }, { silent: true });
}

export function saveCustomFood(food: Omit<CustomFood, 'id'> & { id?: ID }): ID {
  const id = food.id ?? `c${uid()}`;
  update((s) => {
    const i = s.customFoods.findIndex((f) => f.id === id);
    const value = { ...food, id } as CustomFood;
    if (i >= 0) s.customFoods[i] = value;
    else s.customFoods.push(value);
  }, { silent: true });
  return id;
}

export function deleteCustomFood(id: ID) {
  update((s) => {
    s.customFoods = s.customFoods.filter((f) => f.id !== id);
  }, { silent: true });
}

/* ------------------------------------------------------------------ */
/* Peso y medidas                                                       */
/* ------------------------------------------------------------------ */

export function saveMetricType(m: Omit<MetricType, 'id'> & { id?: ID }): ID {
  const id = m.id ?? uid();
  update((s) => {
    const i = s.metricTypes.findIndex((x) => x.id === id);
    const value = { ...m, id } as MetricType;
    if (i >= 0) s.metricTypes[i] = value;
    else s.metricTypes.push(value);
  }, { silent: true });
  return id;
}

export function deleteMetricType(id: ID) {
  update((s) => {
    s.metricTypes = s.metricTypes.filter((m) => m.id !== id);
    s.metrics = s.metrics.filter((e) => e.metricId !== id);
  }, { silent: true });
}

/** Una medida por día y tipo: si ya hay una ese día, se sustituye. */
export function saveMetricEntry(e: Omit<MetricEntry, 'id'> & { id?: ID }): ID {
  let id = e.id ?? uid();
  update((s) => {
    const same = s.metrics.find((x) => x.metricId === e.metricId && x.date === e.date && x.id !== e.id);
    if (same) {
      s.metrics = s.metrics.filter((x) => x.id !== e.id);
      Object.assign(same, { value: e.value, note: e.note });
      id = same.id;
      return;
    }
    const i = s.metrics.findIndex((x) => x.id === id);
    const value = { ...e, id } as MetricEntry;
    if (i >= 0) s.metrics[i] = value;
    else s.metrics.push(value);
  }, { silent: true });
  return id;
}

export function deleteMetricEntry(id: ID) {
  update((s) => {
    s.metrics = s.metrics.filter((x) => x.id !== id);
  }, { silent: true });
}

export function restoreMetricEntry(e: MetricEntry) {
  update((s) => {
    if (!s.metrics.some((x) => x.id === e.id)) s.metrics.push(e);
  }, { silent: true });
}

/* ------------------------------------------------------------------ */
/* Finanzas                                                             */
/* ------------------------------------------------------------------ */

/** Lo de la cuenta conjunta se apunta para enviarlo a la hoja compartida. */
function finShared(s: AppState, scope: FinScope, key: string) {
  if (scope !== 'hogar') return;
  if (!s.finance.pending.includes(key)) s.finance.pending.push(key);
}

function finUpdate(mutator: (s: AppState) => void, shared: boolean) {
  update(mutator, { silent: true });
  if (shared) for (const fn of listListeners) fn();
}

export type MovementInput = Omit<Movement, 'id' | 'updatedAt' | 'by'>;

export function addMovement(input: MovementInput): ID {
  const id = `M${uid()}`;
  finUpdate((s) => {
    s.finance.movements.push({ ...input, id, updatedAt: Date.now(), by: me() });
    finShared(s, input.scope, `m:${id}`);
  }, input.scope === 'hogar');
  return id;
}

/** Varios de golpe (al importar del banco). */
export function addMovements(inputs: MovementInput[]): ID[] {
  const ids: ID[] = [];
  const shared = inputs.some((i) => i.scope === 'hogar');
  finUpdate((s) => {
    const t = Date.now();
    for (const input of inputs) {
      const id = `M${uid()}`;
      ids.push(id);
      s.finance.movements.push({ ...input, id, updatedAt: t, by: me() });
      finShared(s, input.scope, `m:${id}`);
    }
  }, shared);
  return ids;
}

/** Deshacer una importación. */
export function deleteMovements(ids: ID[]) {
  const set = new Set(ids);
  const shared = state.finance.movements.some((m) => set.has(m.id) && m.scope === 'hogar');
  finUpdate((s) => {
    const t = Date.now();
    s.finance.movements = s.finance.movements.flatMap((m) => {
      if (!set.has(m.id)) return [m];
      if (m.scope !== 'hogar') return [];
      finShared(s, 'hogar', `m:${m.id}`);
      return [{ ...m, deleted: true, updatedAt: t, by: me() }];
    });
  }, shared);
}

export function updateMovement(id: ID, patch: Partial<MovementInput>) {
  const scope = state.finance.movements.find((m) => m.id === id)?.scope;
  finUpdate((s) => {
    const m = s.finance.movements.find((x) => x.id === id);
    if (!m) return;
    const before = m.scope;
    Object.assign(m, patch, { updatedAt: Date.now(), by: me() });
    // Si cambia de cuenta, la otra copia se borra en la hoja.
    if (before !== m.scope && before === 'hogar') {
      const copy = { ...m, id: `M${uid()}` };
      Object.assign(m, { scope: 'hogar', deleted: true });
      s.finance.movements.push(copy);
      finShared(s, 'hogar', `m:${m.id}`);
      return;
    }
    finShared(s, m.scope, `m:${m.id}`);
  }, scope === 'hogar' || patch.scope === 'hogar');
}

export function deleteMovement(id: ID) {
  const scope = state.finance.movements.find((m) => m.id === id)?.scope;
  finUpdate((s) => {
    const m = s.finance.movements.find((x) => x.id === id);
    if (!m) return;
    if (m.scope === 'hogar') {
      Object.assign(m, { deleted: true, updatedAt: Date.now(), by: me() });
      finShared(s, 'hogar', `m:${id}`);
    } else s.finance.movements = s.finance.movements.filter((x) => x.id !== id);
  }, scope === 'hogar');
}

export function restoreMovement(m: Movement) {
  finUpdate((s) => {
    const cur = s.finance.movements.find((x) => x.id === m.id);
    if (cur) Object.assign(cur, { deleted: false, updatedAt: Date.now() });
    else s.finance.movements.push({ ...m, deleted: false, updatedAt: Date.now() });
    finShared(s, m.scope, `m:${m.id}`);
  }, m.scope === 'hogar');
}

export type RecurringInput = Omit<Recurring, 'id' | 'updatedAt' | 'by'> & { id?: ID };

export function saveRecurring(input: RecurringInput): ID {
  const id = input.id ?? `F${uid()}`;
  const prevScope = state.finance.recurring.find((r) => r.id === id)?.scope;
  finUpdate((s) => {
    const value: Recurring = { ...input, id, updatedAt: Date.now(), by: me() };
    const i = s.finance.recurring.findIndex((r) => r.id === id);
    if (i >= 0) s.finance.recurring[i] = value;
    else s.finance.recurring.push(value);
    finShared(s, input.scope, `f:${id}`);
  }, input.scope === 'hogar' || prevScope === 'hogar');
  return id;
}

export function deleteRecurring(id: ID) {
  const scope = state.finance.recurring.find((r) => r.id === id)?.scope;
  finUpdate((s) => {
    const r = s.finance.recurring.find((x) => x.id === id);
    if (!r) return;
    if (r.scope === 'hogar') {
      Object.assign(r, { deleted: true, updatedAt: Date.now(), by: me() });
      finShared(s, 'hogar', `f:${id}`);
    } else s.finance.recurring = s.finance.recurring.filter((x) => x.id !== id);
  }, scope === 'hogar');
}

/** Un fijo que un mes concreto no se carga (o deshacerlo). */
export function setRecurringSkip(id: ID, month: string, skipped: boolean) {
  const scope = state.finance.recurring.find((r) => r.id === id)?.scope;
  finUpdate((s) => {
    const r = s.finance.recurring.find((x) => x.id === id);
    if (!r) return;
    const set = new Set(r.skips ?? []);
    if (skipped) set.add(month);
    else set.delete(month);
    Object.assign(r, { skips: [...set].sort(), updatedAt: Date.now(), by: me() });
    finShared(s, r.scope, `f:${id}`);
  }, scope === 'hogar');
}

export type AccountPart = 'periods' | 'budgets' | 'balance';

/** Cambia la configuración de una cuenta (periodos, presupuestos o saldo). */
export function updateFinAccount(scope: FinScope, part: AccountPart, patch: Partial<Omit<FinAccount, 'stamps'>>) {
  finUpdate((s) => {
    const a = s.finance.accounts[scope];
    Object.assign(a, patch);
    if (part === 'periods') a.periodStarts = [...new Set(a.periodStarts)].sort();
    a.stamps = { ...a.stamps, [part]: Date.now() };
    finShared(s, scope, `c:${part}`);
  }, scope === 'hogar');
}

/** Resultado de sincronizar la cuenta conjunta con la hoja. */
export function applyFinanceSync(next: Pick<FinanceState, 'movements' | 'recurring' | 'pending'> & { hogar: FinAccount }, sharePatch: Partial<ShareConfig>) {
  update((s) => {
    s.finance.movements = next.movements;
    s.finance.recurring = next.recurring;
    s.finance.accounts.hogar = next.hogar;
    s.finance.pending = next.pending;
    if (s.share) s.share = { ...s.share, ...sharePatch };
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
