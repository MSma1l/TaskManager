import { useState, useEffect, useCallback } from 'react';
import { ProjectActivity, activityApi } from '../api/activity';

/**
 * Project-level activity feed. Fetched on mount (and via `refetch`), with light
 * polling every ~15s so the feed stays fresh while the tab is open.
 * Pass `projectId = null` to disable.
 */
export function useProjectActivity(projectId: string | null, limit = 50) {
  const [activity, setActivity] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(
    async (showLoading = false) => {
      if (!projectId) return;
      if (showLoading) setLoading(true);
      try {
        const data = await activityApi.projectActivity(projectId, limit);
        setActivity(data);
      } catch {
        // ignore — keep last good state
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [projectId, limit],
  );

  useEffect(() => {
    if (!projectId) {
      setActivity([]);
      return;
    }
    fetch(true);
    const id = setInterval(() => fetch(false), 15000);
    return () => clearInterval(id);
  }, [projectId, fetch]);

  return { activity, loading, refetch: () => fetch(false) };
}
