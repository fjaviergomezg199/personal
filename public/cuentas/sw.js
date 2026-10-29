/* Service worker de Cuentas Claras: la app abre sin conexión y se actualiza sola cuando hay red. */
const VERSION = '202610291945';
const CACHE = 'cuentas-' + VERSION;
const FONTS = 'cuentas-fuentes';
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('cuentas-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Tipografías de Google: de la caché si ya están, para que se vean igual sin conexión.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(FONTS);
        const hit = await cache.match(req);
        if (hit) return hit;
        try { const res = await fetch(req); cache.put(req, res.clone()); return res; } catch (_) { return Response.error(); }
      })(),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.search) return; // comprobaciones de versión (?v=…): siempre a la red, sin guardar

  // La página: primero la red (así llegan las versiones nuevas); sin conexión, la copia guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          // Sin la caché del navegador (GitHub Pages la guarda 10 minutos): así llega siempre la última versión.
          const fresh = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
          if (fresh.ok) cache.put('index.html', fresh.clone());
          return fresh;
        } catch (_) {
          return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Iconos y manifiesto: de la caché y, si no están, de la red.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; } catch (_) { return Response.error(); }
    })(),
  );
});
