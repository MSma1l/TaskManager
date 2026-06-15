import { useState, useEffect, useCallback } from 'react';
import {
  Sprint,
  CreateSprintData,
  UpdateSprintData,
  sprintsApi,
} from '../api/sprints';

export function useSprints(projectId: string) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await sprintsApi.list(projectId);
      setSprints(data);
    } catch {
      // ignore — keep last good state
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (data: CreateSprintData) => {
    const sprint = await sprintsApi.create(projectId, data);
    await fetch();
    return sprint;
  };

  const update = async (sprintId: string, data: UpdateSprintData) => {
    const sprint = await sprintsApi.update(projectId, sprintId, data);
    await fetch();
    return sprint;
  };

  const remove = async (sprintId: string) => {
    await sprintsApi.remove(projectId, sprintId);
    await fetch();
  };

  const start = async (sprintId: string) => {
    const sprint = await sprintsApi.start(projectId, sprintId);
    await fetch();
    return sprint;
  };

  const complete = async (sprintId: string) => {
    const sprint = await sprintsApi.complete(projectId, sprintId);
    await fetch();
    return sprint;
  };

  const addTask = async (sprintId: string, taskId: string) => {
    const result = await sprintsApi.addTask(projectId, sprintId, taskId);
    await fetch();
    return result;
  };

  const removeTask = async (sprintId: string, taskId: string) => {
    await sprintsApi.removeTask(projectId, sprintId, taskId);
    await fetch();
  };

  return {
    sprints,
    loading,
    refetch: fetch,
    create,
    update,
    remove,
    start,
    complete,
    addTask,
    removeTask,
  };
}
