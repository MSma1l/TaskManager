// Bumped version → triggers activate, which clears all old caches.
const CACHE_NAME = 'taskmanager-v3';

self.addEventListener('install', (event) => {
  // Activate the new SW immediately so old cached versions stop serving stale code.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Network-first for everything. We don't cache HTML/JS in this app — too easy
// to ship stale builds. The browser still does its own HTTP caching.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only handle GETs we own; let everything else (POST, cross-origin, etc.) pass through.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(() => new Response('', { status: 504 })));
});
