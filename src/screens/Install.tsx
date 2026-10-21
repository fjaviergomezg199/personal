import { Share, SquarePlus } from 'lucide-react';
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Se llama al arrancar para no perder el evento de instalación (Android/Chrome). */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || !!(navigator as { standalone?: boolean }).standalone;
}

export function InstallCard() {
  const prompt = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => deferred,
  );
  if (isStandalone()) return null;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);

  return (
    <div className="section">
      <div className="card tone-primary" style={{ background: 'var(--primary-soft)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>📲 Instálala en el móvil</div>
        {prompt ? (
          <>
            <p className="small" style={{ margin: '0 0 10px' }}>
              Tendrás su icono en la pantalla de inicio, se abrirá a pantalla completa y funcionará sin conexión.
            </p>
            <button
              className="btn small"
              onClick={async () => {
                await prompt.prompt();
                deferred = null;
                listeners.forEach((l) => l());
              }}
            >
              Instalar
            </button>
          </>
        ) : isIOS ? (
          <ol className="small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
            <li>
              Abre esta página en <b>Safari</b>.
            </li>
            <li>
              Pulsa <Share size={15} style={{ verticalAlign: -2 }} /> <b>Compartir</b>.
            </li>
            <li>
              Elige <SquarePlus size={15} style={{ verticalAlign: -2 }} /> <b>Añadir a pantalla de inicio</b>.
            </li>
            <li>Ábrela desde el icono (así funcionan los avisos en iPhone).</li>
          </ol>
        ) : isAndroid ? (
          <p className="small" style={{ margin: 0 }}>
            En Chrome, abre el menú <b>⋮</b> y pulsa <b>«Instalar aplicación»</b> o <b>«Añadir a pantalla de inicio»</b>.
          </p>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            Abre esta dirección en el navegador de tu móvil y añádela a la pantalla de inicio.
          </p>
        )}
      </div>
    </div>
  );
}
