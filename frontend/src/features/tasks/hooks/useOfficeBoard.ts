import { useCallback, useEffect, useRef, useState } from 'react';
import { officeApi, OfficeBoardResponse } from '../api/office';
import { boardApi } from '../../projects/api/board';
import { membersApi, ProjectMember } from '../../projects/api/members';

const POLL_INTERVAL = 5000;

/**
 * Board-ul de birou. Reutilizează endpoint-urile board-ului de proiect
 * (`boardApi.*`) apelate cu `projectId`-ul de birou întors de `/office/board`.
 */
export function useOfficeBoard() {
  const [data, setData] = useState<OfficeBoardResponse | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const isDraggingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const projectIdRef = useRef<string>('');

  const fetchBoard = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await officeApi.getBoard();
      if (!isDraggingRef.current) setData(res);
      // Încarcă membrii proiectului de birou o singură dată (pentru picker/mențiuni).
      if (res.projectId && res.projectId !== projectIdRef.current) {
        projectIdRef.current = res.projectId;
        membersApi
          .list(res.projectId)
          .then(setMembers)
          .catch(() => {});
      }
    } catch {
      // ignore — păstrăm ultima stare bună
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard(true);
    intervalRef.current = setInterval(() => fetchBoard(false), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBoard]);

  const projectId = data?.projectId ?? '';

  const moveTask = async (taskId: string, toColumnId: string, toIndex: number) => {
    if (!projectId) return;
    // update optimist local pe coloane
    setData((prev) => {
      if (!prev) return prev;
      const task = prev.tasks.find((t) => t.id === taskId);
      if (!task) return prev;
      const tasks = prev.tasks.map((t) =>
        t.id === taskId ? { ...t, boardColumnId: toColumnId, boardOrder: toIndex } : t,
      );
      return { ...prev, tasks };
    });
    try {
      await boardApi.moveTask(projectId, taskId, toColumnId, toIndex);
    } finally {
      isDraggingRef.current = false;
      await fetchBoard(false);
    }
  };

  const assignTask = async (taskId: string, assigneeIds: string[]) => {
    if (!projectId) return;
    await boardApi.assignTask(projectId, taskId, assigneeIds);
    await fetchBoard(false);
  };

  const addSubtask = async (taskId: string, title: string) => {
    if (!projectId) return;
    await boardApi.addSubtask(projectId, taskId, title);
    await fetchBoard(false);
  };

  const updateSubtask = async (
    taskId: string,
    subtaskId: string,
    data: { title?: string; done?: boolean },
  ) => {
    if (!projectId) return;
    await boardApi.updateSubtask(projectId, taskId, subtaskId, data);
    await fetchBoard(false);
  };

  const removeSubtask = async (taskId: string, subtaskId: string) => {
    if (!projectId) return;
    await boardApi.removeSubtask(projectId, taskId, subtaskId);
    await fetchBoard(false);
  };

  const updateTask = async (taskId: string, patch: { storyPoints?: number }) => {
    if (!projectId) return;
    await boardApi.updateTask(projectId, taskId, patch);
    await fetchBoard(false);
  };

  const setDragging = (v: boolean) => {
    isDraggingRef.current = v;
  };

  return {
    data,
    members,
    projectId,
    loading,
    refetch: () => fetchBoard(false),
    setDragging,
    moveTask,
    assignTask,
    addSubtask,
    updateSubtask,
    removeSubtask,
    updateTask,
  };
}
