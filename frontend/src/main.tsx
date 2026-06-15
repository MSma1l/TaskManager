import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';
import { bootstrapTheme } from './shared/hooks/useTheme';

bootstrapTheme();

// Register the PWA service worker. Network-first for HTML so HMR + new deploys
// always pick up fresh code; cache-first for hashed assets.
//
// IMPORTANT: only register in a production build. The Vite dev server does not
// emit hashed `/assets/*` files — modules are served from `/src/*` and
// `/node_modules/.vite/*`. A service worker that caches the dev `index.html`
// shell produces stale / broken pages on mobile (especially over LAN), so in
// dev we proactively unregister any previously-installed worker and drop its
// caches.
//
// Service workers also require a *secure context*: HTTPS or `http://localhost`.
// When the app is opened on a phone via a plain-HTTP LAN address
// (e.g. http://192.168.x.x), `navigator.serviceWorker` is undefined and the
// registration silently no-ops — the guard below keeps that from throwing.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration failures are non-fatal */
      });
    });
  } else {
    // Dev: tear down any leftover SW from a previous production-style run.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    }).catch(() => { /* non-fatal */ });
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.filter((k) => k.startsWith('tm-')).forEach((k) => caches.delete(k));
      }).catch(() => { /* non-fatal */ });
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
