import { createRoot } from 'react-dom/client';
import { App } from './App';
import { consumeGoogleRedirect, hasValidToken } from './lib/google';
import { handleRedirectResult, maybeAutoReconnect, runSync } from './lib/syncRunner';
import { captureInstallPrompt } from './screens/Install';
import { requestPersistence } from './store/db';
import { flushSave, loadState } from './store/store';
import './styles.css';

async function boot() {
  captureInstallPrompt();
  // La vuelta de Google trae el permiso en el # de la URL: hay que leerlo antes que nada.
  const redirect = consumeGoogleRedirect();
  await loadState();
  void requestPersistence();

  const root = document.getElementById('root')!;
  createRoot(root).render(<App />);

  if (redirect) handleRedirectResult(redirect);
  else if (hasValidToken()) void runSync();
  else setTimeout(() => maybeAutoReconnect(), 1200);

  // En iPhone el teclado tapa lo que está fijo abajo: subimos las hojas.
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => {
      const kb = Math.max(0, Math.round(document.documentElement.clientHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty('--kb', `${kb > 80 ? kb : 0}px`);
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }

  // Guardar antes de que el sistema cierre la app
  const flush = () => void flushSave();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);
}

void boot();
