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

  // En iPhone el teclado no encoge la página: la tapa, y a veces iOS la sube para
  // enseñar el campo. Las hojas se colocan con lo que de verdad se ve: encima del
  // teclado (--kb) y con el alto visible (--vvh).
  const vv = window.visualViewport;
  if (vv) {
    const html = document.documentElement;
    const fit = () => {
      const zoomed = vv.scale > 1.05;
      const kb = zoomed ? 0 : Math.max(0, Math.round(html.clientHeight - vv.height - vv.offsetTop));
      const open = kb > 80;
      html.style.setProperty('--kb', `${open ? kb : 0}px`);
      html.style.setProperty('--vvh', `${Math.round(zoomed ? html.clientHeight : vv.height)}px`);
      html.classList.toggle('kb-open', open);
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }

  // Guardar antes de que el sistema cierre la app
  const flush = () => void flushSave();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);
}

void boot();
