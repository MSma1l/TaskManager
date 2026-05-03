import { useEffect, useRef, useState } from 'react';

const KEY_PREFIX = 'draft:';

/**
 * Persistent state saved to localStorage. Mimics useState but survives reloads
 * — useful for forms so the user doesn't lose typed data on accidental reload
 * or browser crash. Call `clear()` after a successful submit.
 */
export function useLocalDraft<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const fullKey = KEY_PREFIX + key;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  // Debounced write to avoid hammering localStorage on every keystroke
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(fullKey, JSON.stringify(value));
      } catch { /* quota exceeded — ignore */ }
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [fullKey, value]);

  const clear = () => {
    try { localStorage.removeItem(fullKey); } catch { /* ignore */ }
  };

  return [value, setValue, clear];
}

/** List all draft keys currently saved — useful for "draft inbox" UIs. */
export function listDraftKeys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(KEY_PREFIX)) out.push(k.slice(KEY_PREFIX.length));
  }
  return out;
}
