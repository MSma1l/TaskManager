import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme';

export function readStoredTheme(): Theme {
  const t = (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark';
  return t === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

/** Call once at app boot, before React renders. */
export function bootstrapTheme() {
  applyTheme(readStoredTheme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Persist remotely (best-effort)
  const setTheme = useCallback(async (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    if (localStorage.getItem('token')) {
      client.put('/auth/me', { theme: next }).catch(() => { /* ignore */ });
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
