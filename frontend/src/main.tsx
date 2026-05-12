import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';
import { bootstrapTheme } from './shared/hooks/useTheme';

bootstrapTheme();

// Register the PWA service worker. Network-first for HTML so HMR + new deploys
// always pick up fresh code; cache-first for hashed assets.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration failures are non-fatal */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
