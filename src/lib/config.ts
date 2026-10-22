/**
 * Dirección del servidor de hogares de la app: la aplicación web de Apps Script
 * con `serverScriptCode()` (la pone una vez quien mantiene la app, ver #/servidor).
 * Con ella, compartir es pulsar «Compartir» y pasar un código. Vacía: solo se
 * puede compartir con una hoja de Google propia.
 */
export const HOGAR_SERVER: string = (import.meta.env.VITE_HOGAR_SERVER as string | undefined)?.trim() || '';
