import { useState, useEffect } from 'react';

/**
 * Returns `Date.now()` (ms), re-rendering every `intervalMs` while `active`.
 * When inactive it stops ticking (no interval) — used to drive live timer
 * displays without spinning a clock when nothing is running.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
