import { useSyncExternalStore } from 'react';

/*
 * Dictar con el micrófono (la API de voz del navegador). En Android y en Safari
 * funciona; en la app instalada en el iPhone Apple puede no dejar (o parece que
 * escucha pero no llega nada): entonces se avisa de usar el micrófono del teclado
 * y el botón deja de salir en ese móvil hasta que se actualice.
 */

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

/** Por qué no se pudo: el sistema no deja, no hay permiso para el micrófono, no se oyó nada u otra cosa. */
export type DictationError = 'blocked' | 'denied' | 'silence' | 'other';

export interface DictationState {
  listening: boolean;
  /** Lo dictado esta vez (también lo provisional, para verlo mientras se habla). */
  text: string;
  error?: DictationError;
  /** Cambia cada vez que se empieza a dictar. */
  session: number;
}

/** Qué decir cuando no se ha podido dictar. */
export const DICTATION_HELP: Record<DictationError, string> = {
  blocked: 'El móvil no deja dictar desde la app: usa el micrófono del teclado (abajo a la derecha)',
  denied: 'La app no tiene permiso para el micrófono: dáselo en los ajustes del móvil o usa el del teclado',
  silence: 'No te he oído: vuelve a tocar el micrófono y habla',
  other: 'No se ha podido dictar: prueba con el micrófono del teclado',
};

const BLOCKED_KEY = 'diaadia:dictado';
// Si en este rato no ha empezado a escuchar (contando con lo que se tarde en dar permiso), ya no lo hará
const START_TIMEOUT = 10_000;
// Escuchando sin entender nada: o no se habla o no le llega el sonido
const HEAR_TIMEOUT = 8000;
// Al parar se espera lo último que se ha dicho; si no llega, se corta
const STOP_TIMEOUT = 1500;

let state: DictationState = { listening: false, text: '', session: 0 };
let rec: Recognition | null = null;
let heard = false; // esta vez ya ha entendido algo
let byUser = false; // esta vez la ha cortado quien dicta (tocando el micrófono, escribiendo o cerrando)
let watchdog: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(patch: Partial<DictationState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** La app abierta desde el icono de la pantalla de inicio del iPhone. */
function iPhoneApp(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true;
}

// Se apunta con qué versión no dejó: al actualizar el móvil se vuelve a probar
function blockedHere(): boolean {
  try {
    return localStorage.getItem(BLOCKED_KEY) === navigator.userAgent;
  } catch {
    return false;
  }
}

function rememberBlocked() {
  try {
    localStorage.setItem(BLOCKED_KEY, navigator.userAgent);
  } catch {
    /* sin almacenamiento: volverá a probar */
  }
}

function watch(r: Recognition, ms: number, error?: DictationError) {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => end(r, error, true), ms);
}

/** Termina esta vez (lo dictado se queda). Solo cuenta la primera: lo que llegue después se ignora. */
function end(r: Recognition, error?: DictationError, abort = false) {
  if (rec !== r) return;
  clearTimeout(watchdog);
  rec = null;
  if (abort) {
    try {
      r.abort();
    } catch {
      /* ya estaba parado */
    }
  }
  // En la app del iPhone, si se acaba sola sin entender nada es que Apple no deja (diga el error que diga)
  if (!heard && !byUser && iPhoneApp()) error = 'blocked';
  if (error === 'blocked') rememberBlocked();
  set({ listening: false, error });
}

function errorOf(code: string): DictationError | undefined {
  if (code === 'aborted') return undefined; // cortado a propósito
  if (code === 'service-not-allowed') return 'blocked';
  if (code === 'not-allowed' || code === 'audio-capture') return 'denied';
  if (code === 'no-speech') return 'silence';
  return 'other';
}

/** Si en este móvil se puede dictar desde la app. */
export function canDictate(): boolean {
  return !!recognitionCtor() && !blockedHere();
}

/**
 * Empieza a escuchar y devuelve qué vez es (para saber de quién es lo que se dicta), o nada si no hay
 * dictado. Si falla al empezar, esa vez queda con su error. Hay que llamarlo desde el toque (el navegador lo exige).
 */
export function startDictation(): number | undefined {
  const Ctor = recognitionCtor();
  if (!Ctor) return undefined;
  cancelDictation();
  const r = new Ctor();
  r.lang = 'es-ES';
  r.interimResults = true;
  r.continuous = false; // al callarse, termina solo
  r.onstart = () => {
    if (rec === r && !heard && !byUser) watch(r, HEAR_TIMEOUT, 'silence');
  };
  r.onresult = (e) => {
    if (rec !== r) return;
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    if (text.trim() && !heard) {
      heard = true;
      if (!byUser) clearTimeout(watchdog);
    }
    set({ text: text.trim() });
  };
  r.onerror = (e) => end(r, errorOf(e.error));
  r.onend = () => end(r);
  rec = r;
  heard = false;
  byUser = false;
  set({ listening: true, text: '', error: undefined, session: state.session + 1 });
  watch(r, START_TIMEOUT, 'other');
  try {
    r.start();
  } catch {
    end(r, 'other');
  }
  return state.session;
}

/** Deja de escuchar (lo dicho hasta ahora se queda). */
export function stopDictation() {
  const r = rec;
  if (!r) return;
  byUser = true;
  watch(r, STOP_TIMEOUT);
  try {
    r.stop();
  } catch {
    end(r, undefined, true);
  }
}

/** Corta sin esperar (al escribir a mano o cerrar la hoja). */
export function cancelDictation() {
  if (!rec) return;
  byUser = true;
  end(rec, undefined, true);
}

export function useDictation(): DictationState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
