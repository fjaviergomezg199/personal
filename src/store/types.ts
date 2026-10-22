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
  /** Cuándo se marcó como hecho (para el resumen de la semana). */
  doneAt?: string;
  /** Ocurrencias completadas de un elemento repetido. */
  doneDates?: ISODate[];
  important?: boolean;
  google?: GoogleLink;
  /** Pendiente de enviar a Google Calendar. */
  dirty?: boolean;
  /** Plan en pareja: se comparte por el hogar compartido y lo ven los dos. */
  shared?: boolean;
  /** Recordatorio de la propia app («Cerrar el día»): no sale en la agenda. */
  ritual?: 'cierre';
  /** Quién lo cambió por última vez (en los compartidos). */
  by?: string;
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
  | 'metrics'
  | 'money'
  | 'jointMoney'
  | 'habits';
export type TemplateKey = 'studies' | 'running' | 'gym' | 'nutrition' | 'work' | 'home' | 'money' | 'custom';
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
  /** En el servidor de la app: se entra con un código corto (`key`), sin hoja propia. */
  central?: boolean;
  lastSync?: number;
  error?: string;
  /** Hora de la hoja en la última sincronización (para pedir solo lo nuevo). */
  since?: number;
  /** Versión del código de la hoja (la 2 no comparte las finanzas; la 3, los planes). */
  scriptVersion?: number;
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

/* ---------- Hábitos ---------- */

export interface Habit {
  id: ID;
  name: string;
  emoji: string;
  /** Días en que toca (0 = lunes … 6 = domingo). Vacío = todos los días. */
  days: number[];
  /** Veces al día (8 vasos de agua). 1 = hecho o no. */
  target: number;
  unit?: string;
  color: AreaColor;
  order: number;
  archived?: boolean;
  createdAt: string;
}

/* ---------- Finanzas ---------- */

/** «personal»: solo en este móvil. «hogar»: la cuenta conjunta, compartida entre los dos. */
export type FinScope = 'personal' | 'hogar';
export type FinKind = 'gasto' | 'ingreso';

export interface Movement {
  id: ID;
  scope: FinScope;
  kind: FinKind;
  date: ISODate;
  /** En euros, siempre positivo (el tipo dice si entra o sale). */
  amount: number;
  category: string;
  note?: string;
  /** Si es el cargo real de un fijo (para ese mes sustituye al previsto). */
  recurringId?: ID;
  updatedAt: number;
  by?: string;
  deleted?: boolean;
}

export type Cadence = 1 | 2 | 3 | 6 | 12;

/** Gastos o ingresos fijos: hipoteca, luz, nómina… */
export interface Recurring {
  id: ID;
  scope: FinScope;
  kind: FinKind;
  name: string;
  amount: number;
  category: string;
  /** Día del mes en que se carga (1-31; si el mes es más corto, el último). */
  day: number;
  /** Cada cuántos meses. */
  every: Cadence;
  /** Desde cuándo cuenta (y mes de referencia si no es mensual). */
  from: ISODate;
  /** Meses ('AAAA-MM') en los que no se carga. */
  skips?: string[];
  active: boolean;
  updatedAt: number;
  by?: string;
  deleted?: boolean;
}

export interface FinAccount {
  /** Primer día de cada periodo: el día que se cobra, no el 1 de cada mes. */
  periodStarts: ISODate[];
  /** Día de cobro habitual (para avisar de que toca empezar el periodo nuevo). */
  payday?: number;
  /** Tope de gasto por categoría en cada periodo. */
  budgets: Record<string, number>;
  budgetTotal?: number;
  /** Saldo de la cuenta en una fecha (para prever cómo se llega al final del periodo). */
  balance?: { amount: number; date: ISODate };
  /** Último cambio de cada parte (para compartir la cuenta conjunta). */
  stamps: { periods?: number; budgets?: number; balance?: number };
}

export interface FinanceState {
  movements: Movement[];
  recurring: Recurring[];
  accounts: Record<FinScope, FinAccount>;
  /** Cambios de la cuenta conjunta aún no enviados: 'm:<id>', 'f:<id>', 'c:periods'… */
  pending: string[];
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

export type Accent = 'violet' | 'blue' | 'teal' | 'green' | 'amber' | 'orange' | 'rose' | 'pink' | 'slate';
export type Backdrop = 'warm' | 'neutral' | 'cool' | 'tinted';
export type TextSize = 'normal' | 'large' | 'xlarge';
/** Bloques de la pantalla Hoy (se pueden ordenar y ocultar). */
export type TodaySection = 'close' | 'dayview' | 'shopping' | 'overdue' | 'menu' | 'diary' | 'money' | 'habits' | 'week' | 'goals' | 'inbox' | 'upcoming';

/** Copia automática en Google Drive (carpeta «Día a Día · copias»). */
export interface DriveBackup {
  on: boolean;
  /** Última copia subida. */
  last?: string;
  /** Último intento (para no insistir si falla). */
  tried?: string;
  /** Día en que se recuperó una copia: ese día no se hace copia automática (no pisa la de hoy). */
  skipDay?: string;
  /** Huella de los datos de esa copia (si no cambian, no se sube otra). */
  hash?: string;
  /** Copias que hay en Drive. */
  copies?: number;
  error?: string;
  /** Enlace para arreglarlo (activar la API de Drive…). */
  errorLink?: string;
}

export interface Settings {
  name: string;
  theme: 'auto' | 'light' | 'dark';
  /** Color principal de la app. */
  accent?: Accent;
  /** Tono del fondo. */
  backdrop?: Backdrop;
  textSize?: TextSize;
  /** Emoji del saludo («Buenos días, Leyre 👋»). */
  emoji?: string;
  /** Orden y visibilidad de los bloques de Hoy. */
  todayLayout?: { key: TodaySection; hidden?: boolean }[];
  /** «Día a vista» en lista (ahora y después) o por horas. */
  dayView?: 'list' | 'hours';
  /** Hoy en modo sencillo: solo lo esencial. */
  simpleToday?: boolean;
  /** «Cerrar el día»: aviso cada noche (opcional) y último día cerrado. */
  closeDay?: { remind: boolean; time: HHMM; entryId?: ID; last?: ISODate };
  /** Semana (su lunes) cuyo resumen ya se cerró en Hoy. */
  weekCardClosed?: ISODate;
  /** Aviso por defecto para elementos con hora (minutos). */
  defaultAlert: number | null;
  /** Aviso de cumpleaños (minutos antes de las 00:00 del día). */
  birthdayAlert: number | null;
  notifications: boolean;
  google: GoogleSettings;
  lastBackup?: string;
  drive?: DriveBackup;
  onboarded: boolean;
}

export interface AppState {
  version: 4;
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
  /** Planes en pareja cambiados aquí y aún no enviados. */
  planPending: ID[];
  /** Planes en pareja borrados aquí (para que se borren también en el otro móvil). */
  planGone: { id: ID; at: number }[];
  foodLog: FoodLogItem[];
  customFoods: CustomFood[];
  nutritionTargets: NutritionTargets;
  metricTypes: MetricType[];
  metrics: MetricEntry[];
  finance: FinanceState;
  habits: Habit[];
  /** Hábito → día → veces hecho. */
  habitLog: Record<ID, Record<ISODate, number>>;
}
