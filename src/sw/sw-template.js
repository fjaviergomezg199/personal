/* Service worker de Día a Día. Generado en el build (ver vite.config.ts). */
const VERSION = '__VERSION__';
const CACHE = 'diaadia-' + VERSION;
const PRECACHE = __PRECACHE__;
const CUENTAS = new URL('cuentas/', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Uno a uno: si falla un fichero no se rompe toda la instalación.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (_) {
            /* se cacheará al usarse */
          }
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('diaadia-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google, etc.: siempre a la red
  if (url.pathname.startsWith(CUENTAS)) return; // Cuentas Claras (public/cuentas/) tiene su propio service worker

  if (req.mode === 'navigate') {
    // Red primero para recibir las versiones nuevas; sin conexión, la copia.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put('index.html', fresh.clone());
          return fresh;
        } catch (_) {
          return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Ficheros con hash: caché primero.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (_) {
        return Response.error();
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'open', url: target });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
