import { useEffect, useState } from 'react';
import { quickTasksApi } from '../api/quicktasks';

/**
 * Numarul de quick task-uri NEW, pentru badge-ul din sidebar.
 * Poll la ~45s + la revenirea in tab (focus/visibility). Pentru ne-admini
 * backend-ul intoarce 0, deci badge-ul nu apare.
 */
export function useQuickTaskCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      quickTasksApi
        .count()
        .then((c) => { if (alive) setCount(c); })
        .catch(() => { /* silentios: badge-ul ramane la ultima valoare buna */ });
    };
    load();
    const id = window.setInterval(load, 45000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return count;
}
