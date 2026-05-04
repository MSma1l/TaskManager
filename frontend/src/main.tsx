import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';
import { bootstrapTheme } from './shared/hooks/useTheme';

bootstrapTheme();

// Aggressively kill any cached service worker from earlier dev sessions.
// SW caching was causing stale white-screen renders during development.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) r.unregister().catch(() => {});
  }).catch(() => {});
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
