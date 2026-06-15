import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Board,
  BoardColumn,
  BoardTask,
  CreateColumnData,
  UpdateColumnData,
  CreateBoardTaskData,
  UpdateBoardTaskData,
  CreateLabelData,
  TransitionData,
  boardApi,
} from '../api/board';

const POLL_INTERVAL = 5000;

/**
 * `sprintFilter` scopes the board:
 *  - a sprint id → only that sprint,
 *  - `'backlog'` → only backlog tasks,
 *  - `undefined` → all tasks.
 */
export function useBoard(projectId: string, sprintFilter?: string) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  /** True while a card is mid-drag — used to skip clobbering local state with poll results. */
  const isDraggingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBoard = useCallback(
    async (showLoading = false) => {
      if (!projectId) return;
      if (showLoading) setLoading(true);
      try {
        const data = await boardApi.getBoard(projectId, sprintFilter);
        // Never overwrite local optimistic state while the user is dragging.
        if (!isDraggingRef.current) setBoard(data);
      } catch {
        // ignore — keep last good state
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [projectId, sprintFilter],
  );

  useEffect(() => {
    fetchBoard(true);
    intervalRef.current = setInterval(() => fetchBoard(false), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBoard]);

  // ── Columns ──────────────────────────────────────────────────────────────
  const createColumn = async (data: CreateColumnData) => {
    const col = await boardApi.createColumn(projectId, data);
    await fetchBoard(false);
    return col;
  };

  const updateColumn = async (columnId: string, data: UpdateColumnData) => {
    const col = await boardApi.updateColumn(projectId, columnId, data);
    await fetchBoard(false);
    return col;
  };

  const deleteColumn = async (columnId: string) => {
    await boardApi.deleteColumn(projectId, columnId);
    await fetchBoard(false);
  };

  // ── Tasks ────────────────────────────────────────────────────────────────
  const createTask = async (data: CreateBoardTaskData) => {
    const task = await boardApi.createTask(projectId, data);
    await fetchBoard(false);
    return task;
  };

  const updateTask = async (taskId: string, data: UpdateBoardTaskData) => {
    const task = await boardApi.updateTask(projectId, taskId, data);
    await fetchBoard(false);
    return task;
  };

  const deleteTask = async (taskId: string) => {
    await boardApi.deleteTask(projectId, taskId);
    await fetchBoard(false);
  };

  const assignTask = async (taskId: string, assigneeId: string | null) => {
    const task = await boardApi.assignTask(projectId, taskId, assigneeId);
    await fetchBoard(false);
    return task;
  };

  const transitionTask = async (taskId: string, data: TransitionData) => {
    const task = await boardApi.transition(projectId, taskId, data);
    await fetchBoard(false);
    return task;
  };

  /**
   * Optimistic cross-column / reorder move.
   * Applies the new layout to local state immediately, calls the API, then
   * settles by refetching. `isDraggingRef` guards against poll races.
   */
  const moveTask = async (taskId: string, toColumnId: string, toIndex: number) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const columns: BoardColumn[] = prev.columns.map((c) => ({ ...c, tasks: [...c.tasks] }));

      let moved: BoardTask | undefined;
      for (const col of columns) {
        const idx = col.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) {
          moved = col.tasks.splice(idx, 1)[0];
          break;
        }
      }
      if (!moved) return prev;

      const target = columns.find((c) => c.id === toColumnId);
      if (!target) return prev;

      const safeIndex = Math.max(0, Math.min(toIndex, target.tasks.length));
      target.tasks.splice(safeIndex, 0, { ...moved, boardColumnId: toColumnId });

      return { ...prev, columns };
    });

    try {
      await boardApi.moveTask(projectId, taskId, toColumnId, toIndex);
    } catch {
      // On failure, resync from server.
    } finally {
      isDraggingRef.current = false;
      await fetchBoard(false);
    }
  };

  const setDragging = (dragging: boolean) => {
    isDraggingRef.current = dragging;
  };

  // ── Labels ───────────────────────────────────────────────────────────────
  const createLabel = async (data: CreateLabelData) => {
    const label = await boardApi.createLabel(projectId, data);
    await fetchBoard(false);
    return label;
  };

  const deleteLabel = async (labelId: string) => {
    await boardApi.deleteLabel(projectId, labelId);
    await fetchBoard(false);
  };

  return {
    board,
    loading,
    refetch: () => fetchBoard(false),
    setBoard,
    setDragging,
    createColumn,
    updateColumn,
    deleteColumn,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    assignTask,
    transitionTask,
    createLabel,
    deleteLabel,
  };
}
