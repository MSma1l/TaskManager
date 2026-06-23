import client from '../../../shared/api/client';
import { Attachment } from '../../../shared/api/attachment';

export type BoardPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ColumnType =
  | 'BACKLOG'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'VERIFY'
  | 'DONE'
  | 'APPROVED'
  | 'CUSTOM';

export type TransitionAction = 'plan' | 'start' | 'done' | 'approve';

/** Stadiul ciclului de aprobare (null = nu a fost raportat inca). */
export type ApprovalStatus =
  | 'PENDING_REVIEW'
  | 'NEEDS_FIX'
  | 'APPROVED'
  | 'REJECTED';

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface BoardAssignee {
  userId: string;
  username: string;
  fullName: string | null;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  priority: BoardPriority;
  assignee: BoardAssignee | null;
  assignees: BoardAssignee[];
  labels: Label[];
  boardColumnId: string;
  boardOrder: number;
  commentCount: number;
  taskNumber: number | null;
  taskKey: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  dayOfWeek: number | null;
  scheduledDate: string | null;
  storyPoints: number | null;
  approvalStatus: ApprovalStatus | null;
  sprintId: string | null;
  subtasks: Subtask[];
  /** Imagini / note vocale atașate (data-URL base64). Poate fi `[]`. */
  attachments?: Attachment[];
}

export interface BoardColumn {
  id: string;
  name: string;
  position: number;
  color: string | null;
  isDoneColumn: boolean;
  columnType: ColumnType | null;
  tasks: BoardTask[];
}

export interface Board {
  columns: BoardColumn[];
  labels: Label[];
}

export interface CreateColumnData {
  name: string;
  color?: string;
  columnType?: ColumnType;
}

export interface UpdateColumnData {
  name?: string;
  color?: string;
  position?: number;
  isDoneColumn?: boolean;
  columnType?: ColumnType;
}

export interface CreateBoardTaskData {
  title: string;
  description?: string;
  columnId: string;
  assigneeId?: string;
  assigneeIds?: string[];
  priority?: BoardPriority;
  labelIds?: string[];
  dueDate?: string;
  estimateMinutes?: number;
  storyPoints?: number;
}

export interface UpdateBoardTaskData {
  title?: string;
  description?: string;
  priority?: BoardPriority;
  labelIds?: string[];
  dueDate?: string;
  estimateMinutes?: number;
  storyPoints?: number;
}

export interface TransitionData {
  action: TransitionAction;
  estimateMinutes?: number;
  dayOfWeek?: number;
  scheduledDate?: string;
  reminderTime?: string;
}

export interface CreateLabelData {
  name: string;
  color: string;
}

export const boardApi = {
  /**
   * `sprintId` filters the board:
   *  - a sprint id → only that sprint's tasks,
   *  - `'backlog'` → only tasks without a sprint,
   *  - omitted → all tasks.
   */
  getBoard: (projectId: string, sprintId?: string) =>
    client
      .get<Board>(`/projects/${projectId}/board`, {
        params: sprintId ? { sprint_id: sprintId } : undefined,
      })
      .then((r) => r.data),

  createColumn: (projectId: string, data: CreateColumnData) =>
    client.post<BoardColumn>(`/projects/${projectId}/board/columns`, data).then((r) => r.data),
  updateColumn: (projectId: string, columnId: string, data: UpdateColumnData) =>
    client
      .put<BoardColumn>(`/projects/${projectId}/board/columns/${columnId}`, data)
      .then((r) => r.data),
  deleteColumn: (projectId: string, columnId: string) =>
    client.delete(`/projects/${projectId}/board/columns/${columnId}`).then((r) => r.data),

  createTask: (projectId: string, data: CreateBoardTaskData) =>
    client.post<BoardTask>(`/projects/${projectId}/board/tasks`, data).then((r) => r.data),
  updateTask: (projectId: string, taskId: string, data: UpdateBoardTaskData) =>
    client
      .put<BoardTask>(`/projects/${projectId}/board/tasks/${taskId}`, data)
      .then((r) => r.data),
  deleteTask: (projectId: string, taskId: string) =>
    client.delete(`/projects/${projectId}/board/tasks/${taskId}`).then((r) => r.data),
  moveTask: (projectId: string, taskId: string, toColumnId: string, toIndex: number) =>
    client
      .post(`/projects/${projectId}/board/tasks/${taskId}/move`, { toColumnId, toIndex })
      .then((r) => r.data),
  assignTask: (projectId: string, taskId: string, assigneeIds: string[]) =>
    client
      .put<BoardTask>(`/projects/${projectId}/board/tasks/${taskId}/assign`, { assigneeIds })
      .then((r) => r.data),
  transition: (projectId: string, taskId: string, data: TransitionData) =>
    client
      .post<BoardTask>(`/projects/${projectId}/board/tasks/${taskId}/transition`, data)
      .then((r) => r.data),

  listLabels: (projectId: string) =>
    client.get<Label[]>(`/projects/${projectId}/board/labels`).then((r) => r.data),
  createLabel: (projectId: string, data: CreateLabelData) =>
    client.post<Label>(`/projects/${projectId}/board/labels`, data).then((r) => r.data),
  deleteLabel: (projectId: string, labelId: string) =>
    client.delete(`/projects/${projectId}/board/labels/${labelId}`).then((r) => r.data),

  // ── subtaskuri (checklist) ──
  addSubtask: (projectId: string, taskId: string, title: string) =>
    client
      .post<BoardTask>(`/projects/${projectId}/board/tasks/${taskId}/subtasks`, { title })
      .then((r) => r.data),
  updateSubtask: (
    projectId: string,
    taskId: string,
    subtaskId: string,
    data: { title?: string; done?: boolean },
  ) =>
    client
      .patch<BoardTask>(`/projects/${projectId}/board/tasks/${taskId}/subtasks/${subtaskId}`, data)
      .then((r) => r.data),
  removeSubtask: (projectId: string, taskId: string, subtaskId: string) =>
    client
      .delete<BoardTask>(`/projects/${projectId}/board/tasks/${taskId}/subtasks/${subtaskId}`)
      .then((r) => r.data),
  reorderSubtasks: (projectId: string, taskId: string, order: string[]) =>
    client
      .put<BoardTask>(`/projects/${projectId}/board/tasks/${taskId}/subtasks/reorder`, { order })
      .then((r) => r.data),
};
