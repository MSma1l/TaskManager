import client from '../../../shared/api/client';
import { BoardPriority, ColumnType, TransitionData } from '../../projects/api/board';

/** A board task assigned to the current user, surfaced on the home page. */
export interface AssignedTask {
  id: string;
  title: string;
  description: string | null;
  priority: BoardPriority;
  taskNumber: number | null;
  taskKey: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  dayOfWeek: number | null;
  scheduledDate: string | null;
  reminderTime: string | null;
  columnId: string;
  columnName: string;
  columnType: ColumnType | null;
  project: {
    id: string;
    name: string;
    color: string;
    key: string | null;
  };
}

export const assignedApi = {
  getAssigned: () => client.get<AssignedTask[]>('/tasks/assigned').then((r) => r.data),
  /** Plan / schedule an assigned task (same transition endpoint as the board). */
  transition: (projectId: string, taskId: string, data: TransitionData) =>
    client
      .post(`/projects/${projectId}/board/tasks/${taskId}/transition`, data)
      .then((r) => r.data),
};
