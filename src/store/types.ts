export type ID = string;
/** Fecha local 'AAAA-MM-DD'. */
export type ISODate = string;
/** Hora local 'HH:mm'. */
export type HHMM = string;

export type EntryKind = 'reminder' | 'event' | 'task';
export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface GoogleLink {
  id: string;
  calendarId: string;
}

/** Recordatorios, planes y tareas. */
export interface Entry {
  id: ID;
  kind: EntryKind;
  title: string;
  notes?: string;
  url?: string;
  location?: string;
  /** Las tareas pueden no tener fecha. */
  date?: ISODate;
  /** Sin hora = todo el día. */
  time?: HHMM;
  endTime?: HHMM;
  /** Planes de varios días (viajes...). */
  endDate?: ISODate;
  repeat: Repeat;
  repeatUntil?: ISODate;
  /** Minutos antes del inicio (para todo el día, el inicio son las 00:00). null = sin aviso. */
  alert: number | null;
  areaId?: ID;
  category?: string;
  done?: boolean;
  /** Ocurrencias completadas de un elemento repetido. */
  doneDates?: ISODate[];
  important?: boolean;
  google?: GoogleLink;
  /** Pendiente de enviar a Google Calendar. */
  dirty?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Birthday {
  id: ID;
  name: string;
  day: number;
  /** 1-12 */
  month: number;
  year?: number;
  /** Ideas de regalo, notas... */
  notes?: string;
  google?: GoogleLink;
  dirty?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ModuleKey =
  | 'plan'
  | 'tasks'
  | 'goals'
  | 'docs'
  | 'menu'
  | 'lifts'
  | 'notes'
  | 'shopping'
  | 'chores'
  | 'diary'
  | 'metrics';
export type TemplateKey = 'studies' | 'running' | 'gym' | 'nutrition' | 'work' | 'home' | 'custom';
export type AreaColor = 'violet' | 'blue' | 'teal' | 'green' | 'amber' | 'orange' | 'rose' | 'pink' | 'slate';

export interface Lift {
  id: ID;
  name: string;
  aliases: string[];
  /** RM en kg. */
  rm: number;
  updatedAt: string;
  history: { date: ISODate; rm: number }[];
}

export interface Menu {
  meals: string[];
  /** 0 = lunes ... 6 = domingo → comida → texto */
  days: Record<number, Record<string, string>>;
  notes?: string;
}

export interface Area {
  id: ID;
  name: string;
  emoji: string;
  color: AreaColor;
  template: TemplateKey;
  modules: ModuleKey[];
  /** Nombres personalizados de cada bloque ("Lista de la compra"...). */
  labels?: Partial<Record<ModuleKey, string>>;
  showOnToday: boolean;
  notes?: string;
  menu?: Menu;
  lifts?: Lift[];
  /** Redondeo de los pesos calculados (kg). */
  rounding?: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Sesión del plan de un área (estudio, carrera, WOD...). */
export interface PlanItem {
  id: ID;
  areaId: ID;
  date: ISODate;
  time?: HHMM;
  title: string;
  details?: string;
  done?: boolean;
  /** Registro: "5,2 km en 28:30", resultado del WOD... */
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalPeriod = 'week' | 'month' | 'once';

export interface Goal {
  id: ID;
  areaId?: ID;
  title: string;
  /** 1 = objetivo de sí/no. */
  target: number;
  unit?: string;
  period: GoalPeriod;
  /** clave de periodo ('2026-W43', '2026-10', 'total') → valor */
  progress: Record<string, number>;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DocType = 'pdf' | 'html' | 'image' | 'link' | 'text' | 'file';

export interface DocMeta {
  id: ID;
  areaId: ID;
  title: string;
  type: DocType;
  url?: string;
  text?: string;
  mime?: string;
  size?: number;
  fileName?: string;
  pinned?: boolean;
  createdAt: string;
}

/* ---------- Listas del hogar (se pueden compartir) ---------- */

export type ListKey = 'compra' | 'casa';

export interface ListItem {
  id: ID;
  list: ListKey;
  text: string;
  qty?: string;
  done: boolean;
  /** Milisegundos: al fusionar cambios de los dos móviles gana el último. */
  updatedAt: number;
  /** Quién lo añadió o cambió por última vez. */
  by?: string;
  /** Borrado (se conserva un tiempo para que el otro móvil se entere). */
  deleted?: boolean;
}

/** Hogar compartido: una hoja de cálculo de Google con un Apps Script. */
export interface ShareConfig {
  url: string;
  key: string;
  name: string;
  lastSync?: number;
  error?: string;
}

/* ---------- Nutrición ---------- */

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Alimento propio (valores por 100 g). */
export interface CustomFood extends Macros {
  id: ID;
  name: string;
  brand?: string;
  unitName?: string;
  unitGrams?: number;
  barcode?: string;
}

/** Lo que se ha comido (valores ya calculados para la cantidad). */
export interface FoodLogItem extends Macros {
  id: ID;
  date: ISODate;
  meal: string;
  name: string;
  grams: number;
  /** Clave del alimento (base de datos o propio). */
  foodId?: string;
  createdAt: string;
}

export interface NutritionTargets {
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/* ---------- Peso y medidas ---------- */

export interface MetricType {
  id: ID;
  name: string;
  unit: string;
  goal?: number;
  decimals: number;
}

export interface MetricEntry {
  id: ID;
  metricId: ID;
  date: ISODate;
  value: number;
  note?: string;
}

export interface GoogleEvent {
  id: string;
  calendarId: string;
  title: string;
  date: ISODate;
  endDate?: ISODate;
  time?: HHMM;
  endTime?: HHMM;
  location?: string;
  link?: string;
  color?: string;
}

export interface GoogleCalendarInfo {
  id: string;
  name: string;
  color?: string;
  primary?: boolean;
  canWrite?: boolean;
}

export interface GoogleSettings {
  clientId: string;
  email?: string;
  writeCalendarId: string;
  readCalendarIds: string[];
  /** Enviar recordatorios, planes y tareas con fecha. */
  pushEntries: boolean;
  pushBirthdays: boolean;
  /** Al abrir la app, renovar el permiso solo si hay cambios por enviar. */
  autoReconnect: boolean;
  lastSync?: string;
}

export interface Settings {
  name: string;
  theme: 'auto' | 'light' | 'dark';
  /** Aviso por defecto para elementos con hora (minutos). */
  defaultAlert: number | null;
  /** Aviso de cumpleaños (minutos antes de las 00:00 del día). */
  birthdayAlert: number | null;
  notifications: boolean;
  google: GoogleSettings;
  lastBackup?: string;
  onboarded: boolean;
}

export interface AppState {
  version: 2;
  settings: Settings;
  entries: Entry[];
  birthdays: Birthday[];
  areas: Area[];
  plan: PlanItem[];
  goals: Goal[];
  docs: DocMeta[];
  googleEvents: GoogleEvent[];
  googleCalendars: GoogleCalendarInfo[];
  /** Eventos de Google creados por la app que hay que borrar. */
  googleDeletes: GoogleLink[];
  /** Avisos ya mostrados: clave → timestamp. */
  notified: Record<string, number>;
  listItems: ListItem[];
  /** Ids de elementos de las listas cambiados aquí y aún no enviados. */
  listPending: ID[];
  share?: ShareConfig;
  foodLog: FoodLogItem[];
  customFoods: CustomFood[];
  nutritionTargets: NutritionTargets;
  metricTypes: MetricType[];
  metrics: MetricEntry[];
}
