import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dictionaries, Lang, SUPPORTED_LANGS } from './dictionary';

const STORAGE_KEY = 'app:lang';

function detectInitial(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored as Lang)) return stored as Lang;
  // Try the browser locale
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('ru')) return 'ru';
  return 'ro';
}

interface I18nContextValue {
  lang: Lang;
  /** Whether the user explicitly chose a language (vs. the auto-detected fallback) */
  picked: boolean;
  setLang: (l: Lang, opts?: { syncRemote?: boolean }) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitial);
  const [picked, setPicked] = useState(() => !!localStorage.getItem(STORAGE_KEY));

  // Reflect on the <html> element so screen readers + accessibility tools know
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && SUPPORTED_LANGS.includes(e.newValue as Lang)) {
        setLangState(e.newValue as Lang);
        setPicked(true);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setLang = useCallback((l: Lang, opts: { syncRemote?: boolean } = {}) => {
    if (!SUPPORTED_LANGS.includes(l)) return;
    setLangState(l);
    setPicked(true);
    localStorage.setItem(STORAGE_KEY, l);
    // Best-effort persistence to user profile so the choice follows the
    // account between devices (and Telegram bot uses the same value).
    if (opts.syncRemote !== false && localStorage.getItem('token')) {
      // Lazy import to avoid pulling axios into the initial render path
      import('../../features/auth/api/auth')
        .then(({ authApi }) => authApi.updateMe({ language: l }).catch(() => {}))
        .catch(() => {});
    }
  }, []);

  const t = useCallback((key: string) => {
    const path = key.split('.');
    let cur: any = dictionaries[lang];
    for (const seg of path) {
      cur = cur && typeof cur === 'object' ? cur[seg] : undefined;
      if (cur === undefined) {
        // Fall back to RO if missing in selected lang
        let fb: any = dictionaries.ro;
        for (const s of path) fb = fb && typeof fb === 'object' ? fb[s] : undefined;
        return typeof fb === 'string' ? fb : key;
      }
    }
    return typeof cur === 'string' ? cur : key;
  }, [lang]);

  const value = useMemo<I18nContextValue>(() => ({ lang, picked, setLang, t }), [lang, picked, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be inside <I18nProvider>');
  return ctx;
}

/** Convenience: returns just the `t` function. */
export function useT() {
  return useI18n().t;
}
