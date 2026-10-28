export type ID = string;
/** Fecha local 'AAAA-MM-DD'. */
export type ISODate = string;
/** Hora local 'HH:mm'. */
export type HHMM = string;

export type EntryKind = 'reminder' | 'event' | 'task';
export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

/** Colores de las categorías, los hábitos y el color principal de la app. */
export type ColorKey = 'violet' | 'blue' | 'teal' | 'green' | 'amber' | 'orange' | 'rose' | 'pink' | 'slate';

export interface GoogleLink {
  id: string;
  calendarId: string;
}

/** Una categoría propia («2Sigma», «Running»…): lo que lleva sale de su color. */
export interface Category {
  id: ID;
  name: string;
  color: ColorKey;
  emoji?: string;
  order: number;
  createdAt: string;
}

/** Planes, tareas y recordatorios del calendario. */
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
  categoryId?: ID;
  /** Importado de un JSON (para deshacer la importación de una vez). */
  importId?: ID;
  done?: boolean;
  doneAt?: string;
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

export interface Habit {
  id: ID;
  name: string;
  emoji: string;
  /** Días en que toca (0 = lunes … 6 = domingo). Vacío = todos los días. */
  days: number[];
  /** Veces al día (8 vasos de agua). 1 = hecho o no. */
  target: number;
  unit?: string;
  color: ColorKey;
  order: number;
  archived?: boolean;
  createdAt: string;
}

/** Una importación de JSON (se puede deshacer entera). */
export interface ImportBatch {
  id: ID;
  name: string;
  count: number;
  at: string;
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
  /** Enviar planes, tareas y recordatorios con fecha. */
  pushEntries: boolean;
  pushBirthdays: boolean;
  /** Al abrir la app, renovar el permiso solo si hay cambios por enviar. */
  autoReconnect: boolean;
  lastSync?: string;
}

export type Accent = ColorKey;
export type Backdrop = 'warm' | 'neutral' | 'cool' | 'tinted';
export type TextSize = 'normal' | 'large' | 'xlarge';
export type CalendarView = 'month' | 'week' | 'day';

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
  /** La vista del calendario que se usó la última vez. */
  calendarView?: CalendarView;
  /** Categorías que no se ven en el calendario. */
  hiddenCategories?: ID[];
  /** Aviso por defecto para lo que tiene hora (minutos). */
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
  version: 5;
  settings: Settings;
  entries: Entry[];
  categories: Category[];
  birthdays: Birthday[];
  habits: Habit[];
  /** Hábito → día → veces hecho. */
  habitLog: Record<ID, Record<ISODate, number>>;
  imports: ImportBatch[];
  googleEvents: GoogleEvent[];
  googleCalendars: GoogleCalendarInfo[];
  /** Eventos de Google creados por la app que hay que borrar. */
  googleDeletes: GoogleLink[];
  /** Avisos ya mostrados: clave → timestamp. */
  notified: Record<string, number>;
}
