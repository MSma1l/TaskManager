import { useState, useEffect, useCallback } from 'react';
import { BoardTask } from '../api/board';
import { sprintsApi } from '../api/sprints';

export function useBacklog(projectId: string) {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await sprintsApi.backlog(projectId);
      setTasks(data);
    } catch {
      // ignore — keep last good state
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { tasks, loading, refetch: fetch };
}
