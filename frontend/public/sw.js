// Self-uninstaller. The cache-first SW from v1/v2 was serving stale builds during
// active development. This file replaces those: when activated it deletes every
// cache, unregisters itself, then asks open clients to reload on the fresh code.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* ignore */ }
    try {
      await self.registration.unregister();
    } catch (_) { /* ignore */ }
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch (_) { /* ignore */ }
    }
  })());
});

// Pass everything through. We're going away anyway.
self.addEventListener('fetch', () => { /* let browser handle */ });
