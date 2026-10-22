/// <reference types="vite/client" />

declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** ID de cliente OAuth de Google (opcional; también se puede poner en Ajustes). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Servidor de hogares de la app (aplicación web de Apps Script; ver src/lib/config.ts). */
  readonly VITE_HOGAR_SERVER?: string;
}
