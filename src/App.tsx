import { useEffect, useLayoutEffect, useState } from 'react';
import { GlobalSheets } from './components/GlobalSheets';
import { useCurrentSheet } from './components/sheets';
import { ShareSheet } from './components/ShareSheet';
import { TabBar } from './components/TabBar';
import { ConfirmHost, toast, Toaster } from './components/ui';
import { combine, todayISO } from './lib/dates';
import { hasValidToken } from './lib/google';
import { dueAlerts, showSystemNotification } from './lib/notify';
import { nextOccurrence } from './lib/recurrence';
import { navigate, useRoute } from './lib/router';
import { maybeAutoReconnect, runSync } from './lib/syncRunner';
import { Agenda } from './screens/Agenda';
import { AreaDetail } from './screens/AreaDetail';
import { Areas } from './screens/Areas';
import { Onboarding } from './screens/Onboarding';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';
import { getState, markNotified, onDataChange, useApp } from './store/store';

export function App() {
  const state = useApp();
  const route = useRoute();
  useTheme(state.settings.theme);
  useAlerts();
  useGoogleSync();
  useServiceWorker();
  const shared = useSharedText();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  if (!state.settings.onboarded) {
    return (
      <>
        <Onboarding />
        <Toaster />
      </>
    );
  }

  const [section, sub] = route.parts;
  let screen;
  if (section === 'agenda') screen = <Agenda />;
  else if (section === 'areas' && sub) screen = <AreaDetail key={sub} id={sub} />;
  else if (section === 'areas') screen = <Areas />;
  else if (section === 'ajustes') screen = <Settings />;
  else screen = <Today />;

  return (
    <div className="app">
      <main>{screen}</main>
      <TabBar />
      <GlobalSheets />
      {shared.text && <ShareSheet text={shared.text} onClose={shared.clear} />}
      <Toaster />
      <ConfirmHost />
    </div>
  );
}

function useTheme(theme: 'auto' | 'light' | 'dark') {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#131312' : '#f5f3ee'));
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [theme]);
}

/** Avisos mientras la app está abierta (o al volver a ella). */
function useAlerts() {
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const s = getState();
        const due = dueAlerts(s, new Date());
        const done: string[] = [];
        for (const a of due) {
          let shown = false;
          if (s.settings.notifications) shown = await showSystemNotification(a);
          if (!shown && document.visibilityState === 'visible') {
            toast(`${a.title}${a.body ? ` · ${a.body}` : ''}`, { duration: 9000 });
            shown = true;
          }
          if (shown) done.push(a.key);
        }
        markNotified(done);
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 30000);
    const onVis = () => document.visibilityState === 'visible' && void tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}

/** ¿Hay algún aviso pendiente de enviar a Google para las próximas 24 h? */
function urgentPending(): boolean {
  const s = getState();
  if (!s.settings.google.pushEntries) return false;
  const now = Date.now();
  return s.entries.some((e) => {
    if (!e.dirty || !e.date || e.alert === null || e.done) return false;
    const next = nextOccurrence(e, todayISO());
    if (!next) return false;
    const at = combine(next, e.time).getTime() - e.alert * 60000;
    return at > now && at - now < 24 * 3600000;
  });
}

function sheetOpen(): boolean {
  return !!document.querySelector('.sheet, .doc-viewer, .dialog');
}

function useGoogleSync() {
  const current = useCurrentSheet();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (hasValidToken()) void runSync();
        else if (urgentPending() && !sheetOpen()) maybeAutoReconnect();
      }, 2000);
    };
    const off = onDataChange(schedule);
    let lastVisibleSync = Date.now();
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (hasValidToken()) {
        if (Date.now() - lastVisibleSync > 5 * 60000) {
          lastVisibleSync = Date.now();
          void runSync();
        }
      } else maybeAutoReconnect();
    };
    document.addEventListener('visibilitychange', onVis);
    const online = () => hasValidToken() && void runSync();
    window.addEventListener('online', online);
    return () => {
      off();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', online);
    };
  }, []);
  // Si quedó algo urgente mientras había una hoja abierta, se intenta al cerrarla.
  useEffect(() => {
    if (current) return;
    const t = setTimeout(() => {
      if (!hasValidToken() && urgentPending() && !sheetOpen()) maybeAutoReconnect();
    }, 2500);
    return () => clearTimeout(t);
  }, [current]);
}

function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    // Solo recargamos cuando la persona acepta la actualización (no en la primera instalación).
    let updateAccepted = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updateAccepted) return;
      updateAccepted = false;
      location.reload();
    });
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | undefined;
      if (data?.type === 'open' && data.url) {
        const hash = new URL(data.url).hash;
        if (hash) navigate(hash.slice(1));
      }
    });
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        const offer = (worker: ServiceWorker) =>
          toast('Hay una versión nueva de la app', {
            action: 'Actualizar',
            onAction: () => {
              updateAccepted = true;
              worker.postMessage('skipWaiting');
            },
            duration: 15000,
          });
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
        // Buscar versiones nuevas de vez en cuando
        setInterval(() => void reg.update().catch(() => undefined), 60 * 60000);
      })
      .catch(() => undefined);
  }, []);
}

/** Texto recibido con «Compartir» (share_target) en ?title=&text=&url= */
function useSharedText() {
  const [text, setText] = useState<string | null>(() => {
    const q = new URLSearchParams(location.search);
    const parts = [q.get('title'), q.get('text'), q.get('url')].filter((x): x is string => !!x && !!x.trim());
    if (!parts.length) return null;
    history.replaceState(null, '', location.pathname.replace(/index\.html$/, '') + (location.hash || '#/hoy'));
    return Array.from(new Set(parts)).join('\n');
  });
  return { text, clear: () => setText(null) };
}
