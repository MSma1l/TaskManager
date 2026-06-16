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

// ── Web Push ────────────────────────────────────────────────────────────────
// Server (push_service) sends a JSON payload { title, body, url }. We show a
// notification even when the app/tab is fully closed.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Task Manager', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Task Manager';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click → focus an existing client on that URL, or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.pathname === targetUrl || client.url.endsWith(targetUrl)) {
          return client.focus();
        }
      } catch (_) { /* ignore */ }
    }
    // No matching tab — focus any open client and navigate, else open new.
    if (allClients.length > 0) {
      const client = allClients[0];
      await client.focus();
      if ('navigate' in client) {
        try { return client.navigate(targetUrl); } catch (_) { /* ignore */ }
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
