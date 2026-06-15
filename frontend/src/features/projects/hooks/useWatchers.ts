import { useState, useEffect, useCallback } from 'react';
import { TaskWatcher, watchersApi } from '../api/watchers';

/**
 * Watchers for a single board task + the current user's watch state.
 * `myUserId` is used to derive `isWatching`. Pass `taskId = null` to disable.
 */
export function useWatchers(taskId: string | null, myUserId: string | null) {
  const [watchers, setWatchers] = useState<TaskWatcher[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(
    async (showLoading = false) => {
      if (!taskId) return;
      if (showLoading) setLoading(true);
      try {
        const data = await watchersApi.list(taskId);
        setWatchers(data);
      } catch {
        // ignore — keep last good state
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [taskId],
  );

  useEffect(() => {
    if (!taskId) {
      setWatchers([]);
      return;
    }
    fetch(true);
  }, [taskId, fetch]);

  const isWatching = !!myUserId && watchers.some((w) => w.userId === myUserId);

  const toggle = async () => {
    if (!taskId) return;
    try {
      if (isWatching) await watchersApi.unwatch(taskId);
      else await watchersApi.watch(taskId);
    } catch {
      // ignore
    } finally {
      await fetch(false);
    }
  };

  return { watchers, loading, isWatching, toggle, refetch: () => fetch(false) };
}
