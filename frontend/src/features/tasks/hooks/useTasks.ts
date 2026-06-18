import { useState, useEffect, useCallback } from 'react';
import { tasksApi, Task, CreateTaskData, Completion } from '../api/tasks';
import { completionsApi } from '../api/completions';

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

  const updateTask = useCallback(
    async (id: string, data: Partial<CreateTaskData>) => {
      await tasksApi.update(id, data);
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

  // ── Optimistic helpers for the weekly board ─────────────────────────────────

  /** Patch a single task in local state (optimistic UI). */
  const patchTask = useCallback((taskId: string, updater: (t: Task) => Task) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)));
  }, []);

  /** Patch the current-week completion of a task (creating one locally if absent). */
  const patchCompletion = useCallback(
    (taskId: string, patch: Partial<Completion>) =>
      patchTask(taskId, (t) => {
        const existing = t.completions?.[0];
        const next: Completion = {
          id: existing?.id || `optimistic-${taskId}`,
          taskId,
          weekStart: existing?.weekStart || weekDate || '',
          status: existing?.status || 'PENDING',
          completedAt: existing?.completedAt ?? null,
          movedToDate: existing?.movedToDate ?? null,
          skipReason: existing?.skipReason ?? null,
          note: existing?.note ?? null,
          ...patch,
        };
        return { ...t, completions: [next] };
      }),
    [patchTask, weekDate]
  );

  /** Drag-to-reschedule: move a task to another day (optimistic). */
  const rescheduleTask = useCallback(
    async (taskId: string, dayOfWeek: number, scheduledDate?: string) => {
      const prev = tasks;
      patchTask(taskId, (t) => ({ ...t, dayOfWeek, scheduledDate: scheduledDate ?? t.scheduledDate }));
      try {
        const data: Partial<CreateTaskData> = { dayOfWeek };
        if (scheduledDate) data.scheduledDate = scheduledDate;
        await tasksApi.update(taskId, data);
      } catch (err) {
        console.error('Reschedule failed:', err);
        setTasks(prev);
      }
    },
    [tasks, patchTask]
  );

  /** Drag-to-status / "Am luat in lucru": PENDING + note (or reset when note empty). */
  const startTask = useCallback(
    async (taskId: string, note?: string, weekStart?: string) => {
      const prev = tasks;
      const cleaned = (note || '').trim() || null;
      patchCompletion(taskId, { status: 'PENDING', note: cleaned, completedAt: null, skipReason: null, movedToDate: null });
      try {
        await completionsApi.start(taskId, cleaned ?? '', weekStart);
      } catch (err) {
        console.error('Start failed:', err);
        setTasks(prev);
      }
    },
    [tasks, patchCompletion]
  );

  /** Drag-to-done / quick "Finalizat" (optimistic). */
  const completeTask = useCallback(
    async (taskId: string, note?: string, weekStart?: string) => {
      const prev = tasks;
      patchCompletion(taskId, { status: 'DONE', completedAt: new Date().toISOString(), note: (note || '').trim() || null });
      try {
        await completionsApi.markDone(taskId, note, weekStart);
      } catch (err) {
        console.error('Complete failed:', err);
        setTasks(prev);
      }
    },
    [tasks, patchCompletion]
  );

  return {
    tasks,
    loading,
    refetch: fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    rescheduleTask,
    startTask,
    completeTask,
  };
}
