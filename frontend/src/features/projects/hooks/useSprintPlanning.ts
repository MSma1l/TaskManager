import { useState, useEffect, useCallback, useRef } from 'react';
import { BoardTask } from '../api/board';
import { Sprint, CapacityWarning, sprintsApi } from '../api/sprints';

/**
 * Compune backlog-ul + sprinturile unui proiect pentru planificarea prin
 * drag&drop. Expune mutari optimiste (scoate din sursa, pune in tinta) urmate
 * de apelul API si un refetch de reconciliere.
 */
export function useSprintPlanning(projectId: string) {
  const [backlog, setBacklog] = useState<BoardTask[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<CapacityWarning | null>(null);
  /** True cat timp un card e in mijlocul unui drag — evita clobber-ul din poll. */
  const isDraggingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    try {
      const [bk, sp] = await Promise.all([
        sprintsApi.backlog(projectId),
        sprintsApi.list(projectId),
      ]);
      if (!isDraggingRef.current) {
        setBacklog(bk);
        setSprints(sp);
      }
    } catch {
      // ignore — pastreaza ultima stare buna
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const setDragging = (dragging: boolean) => {
    isDraggingRef.current = dragging;
  };

  // ── helpers optimisti ──────────────────────────────────────────────
  const findTask = useCallback(
    (taskId: string): BoardTask | undefined =>
      backlog.find((t) => t.id === taskId) ??
      sprints.flatMap((s) => s.tasks).find((t) => t.id === taskId),
    [backlog, sprints],
  );

  const removeFromBacklog = (taskId: string) =>
    setBacklog((prev) => prev.filter((t) => t.id !== taskId));

  const addToBacklog = (task: BoardTask) =>
    setBacklog((prev) => [...prev, { ...task, sprintId: null }]);

  const removeFromSprint = (taskId: string, sprintId: string) =>
    setSprints((prev) =>
      prev.map((s) =>
        s.id === sprintId ? { ...s, tasks: s.tasks.filter((t) => t.id !== taskId) } : s,
      ),
    );

  const addToSprint = (task: BoardTask, sprintId: string) =>
    setSprints((prev) =>
      prev.map((s) =>
        s.id === sprintId ? { ...s, tasks: [...s.tasks, { ...task, sprintId }] } : s,
      ),
    );

  const settle = async () => {
    isDraggingRef.current = false;
    await fetchAll();
  };

  // ── mutari ─────────────────────────────────────────────────────────
  const moveToSprint = async (taskId: string, sprintId: string) => {
    const task = findTask(taskId);
    if (!task) return;
    if (task.sprintId === sprintId) return;

    // Optimist: scoate din sursa (backlog sau alt sprint), pune in tinta.
    if (task.sprintId) removeFromSprint(taskId, task.sprintId);
    else removeFromBacklog(taskId);
    addToSprint(task, sprintId);

    try {
      const res = await sprintsApi.addTask(projectId, sprintId, taskId);
      setWarning(res.warning && res.warning.overCapacity ? res.warning : null);
    } catch {
      // refetch va resincroniza
    } finally {
      await settle();
    }
  };

  const moveToBacklog = async (taskId: string, fromSprintId: string) => {
    const task = findTask(taskId);
    if (!task) return;

    removeFromSprint(taskId, fromSprintId);
    addToBacklog(task);

    try {
      await sprintsApi.removeTask(projectId, fromSprintId, taskId);
    } catch {
      // refetch va resincroniza
    } finally {
      await settle();
    }
  };

  const moveBetweenSprints = async (
    taskId: string,
    fromSprintId: string,
    toSprintId: string,
  ) => {
    if (fromSprintId === toSprintId) return;
    const task = findTask(taskId);
    if (!task) return;

    removeFromSprint(taskId, fromSprintId);
    addToSprint(task, toSprintId);

    try {
      // Mutarea de sprint -> sprint e doar o re-atribuire (addTask suprascrie sprint_id).
      const res = await sprintsApi.addTask(projectId, toSprintId, taskId);
      setWarning(res.warning && res.warning.overCapacity ? res.warning : null);
    } catch {
      // refetch va resincroniza
    } finally {
      await settle();
    }
  };

  return {
    backlog,
    sprints,
    loading,
    warning,
    clearWarning: () => setWarning(null),
    setDragging,
    findTask,
    refetch: fetchAll,
    moveToSprint,
    moveToBacklog,
    moveBetweenSprints,
  };
}
