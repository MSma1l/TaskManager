import { useState, useEffect, useCallback } from 'react';
import { tasksApi, Task, CreateTaskData } from '../api/tasks';

export function useTasks(weekDate?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tasksApi.getWeek(weekDate);
      setTasks(data);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [weekDate]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const createTask = useCallback(
    async (data: CreateTaskData) => {
      await tasksApi.create(data);
      await fetchTasks();
    },
    [fetchTasks]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await tasksApi.delete(id);
      await fetchTasks();
    },
    [fetchTasks]
  );

  return { tasks, loading, refetch: fetchTasks, createTask, deleteTask };
}
