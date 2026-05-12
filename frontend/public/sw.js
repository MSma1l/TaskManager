// Task Manager PWA service worker.
//
// Strategy:
//  - /assets/*  (hashed by Vite)         → cache-first, immutable
//  - /icons/*, /manifest.json            → cache-first with revalidation
//  - HTML navigations                    → network-first, fall back to cached index.html
//  - /api/*                              → never touch (always network)
//
// Bump CACHE_VERSION when you change SW logic so old caches get evicted.

const CACHE_VERSION = 'v3';
const CACHE_NAME = `tm-${CACHE_VERSION}`;
const OFFLINE_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept API calls or websockets
  if (url.pathname.startsWith('/api/')) return;
  if (req.headers.get('upgrade') === 'websocket') return;

  // HTML navigations: network-first, fall back to cached shell
  const isNavigation =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(OFFLINE_URL, fresh.clone());
        return fresh;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(OFFLINE_URL);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Hashed static assets: cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Everything else (manifest.json, fonts, etc.): stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((fresh) => {
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    }).catch(() => cached);
    return cached || fetchPromise;
  })());
});

// Allow the page to request immediate activation when a new SW is waiting
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
