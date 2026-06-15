import { useState, useEffect, useCallback } from 'react';
import { TaskActivity, activityApi } from '../api/activity';

/**
 * Activity log for a single board task. Fetched once when the drawer opens
 * (and via `refetch` after workflow actions). Pass `taskId = null` to disable.
 */
export function useTaskActivity(taskId: string | null) {
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(
    async (showLoading = false) => {
      if (!taskId) return;
      if (showLoading) setLoading(true);
      try {
        const data = await activityApi.list(taskId);
        setActivity(data);
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
      setActivity([]);
      return;
    }
    fetch(true);
  }, [taskId, fetch]);

  return { activity, loading, refetch: () => fetch(false) };
}
