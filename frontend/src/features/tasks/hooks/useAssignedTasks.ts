import { useCallback, useEffect, useState } from 'react';
import { AssignedTask, assignedApi } from '../api/assigned';
import { TransitionData } from '../../projects/api/board';

export function useAssignedTasks() {
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await assignedApi.getAssigned();
      setTasks(data);
    } catch {
      // ignore — keep last good state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const planTask = useCallback(
    async (projectId: string, taskId: string, data: TransitionData) => {
      await assignedApi.transition(projectId, taskId, data);
      await fetch();
    },
    [fetch],
  );

  return { tasks, loading, refetch: fetch, planTask };
}
