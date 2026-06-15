import client from '../../../shared/api/client';

export type BoardPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ColumnType =
  | 'BACKLOG'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'APPROVED'
  | 'CUSTOM';

export type TransitionAction = 'plan' | 'start' | 'done' | 'approve';

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

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  priority: BoardPriority;
  assignee: BoardAssignee | null;
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
  priority?: BoardPriority;
  labelIds?: string[];
  dueDate?: string;
  estimateMinutes?: number;
}

export interface UpdateBoardTaskData {
  title?: string;
  description?: string;
  priority?: BoardPriority;
  labelIds?: string[];
  dueDate?: string;
  estimateMinutes?: number;
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
  getBoard: (projectId: string) =>
    client.get<Board>(`/projects/${projectId}/board`).then((r) => r.data),

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
  assignTask: (projectId: string, taskId: string, assigneeId: string | null) =>
    client
      .put<BoardTask>(`/projects/${projectId}/board/tasks/${taskId}/assign`, { assigneeId })
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
};
