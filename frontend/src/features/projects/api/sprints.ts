import client from '../../../shared/api/client';
import { BoardTask } from './board';

export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';

export interface SprintMember {
  userId: string;
  username: string;
  points: number;
  capacityPoints: number;
  overCapacity: boolean;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  totalPoints: number;
  taskCount: number;
  perMember: SprintMember[];
}

export interface CreateSprintData {
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
}

export interface UpdateSprintData {
  name?: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status?: SprintStatus;
}

/** Returned when a task is added to a sprint and the assignee would be over capacity. */
export interface CapacityWarning {
  overCapacity: boolean;
  assigneePoints: number;
  capacityPoints: number;
}

export interface AddTaskResult {
  task: BoardTask;
  warning: CapacityWarning | null;
}

export const sprintsApi = {
  list: (projectId: string) =>
    client.get<Sprint[]>(`/projects/${projectId}/sprints`).then((r) => r.data),
  create: (projectId: string, data: CreateSprintData) =>
    client.post<Sprint>(`/projects/${projectId}/sprints`, data).then((r) => r.data),
  update: (projectId: string, sprintId: string, data: UpdateSprintData) =>
    client.put<Sprint>(`/projects/${projectId}/sprints/${sprintId}`, data).then((r) => r.data),
  remove: (projectId: string, sprintId: string) =>
    client.delete(`/projects/${projectId}/sprints/${sprintId}`).then((r) => r.data),
  start: (projectId: string, sprintId: string) =>
    client.post<Sprint>(`/projects/${projectId}/sprints/${sprintId}/start`).then((r) => r.data),
  complete: (projectId: string, sprintId: string) =>
    client.post<Sprint>(`/projects/${projectId}/sprints/${sprintId}/complete`).then((r) => r.data),
  addTask: (projectId: string, sprintId: string, taskId: string) =>
    client
      .post<AddTaskResult>(`/projects/${projectId}/sprints/${sprintId}/tasks/${taskId}`)
      .then((r) => r.data),
  removeTask: (projectId: string, sprintId: string, taskId: string) =>
    client
      .delete(`/projects/${projectId}/sprints/${sprintId}/tasks/${taskId}`)
      .then((r) => r.data),

  backlog: (projectId: string) =>
    client.get<BoardTask[]>(`/projects/${projectId}/backlog`).then((r) => r.data),
};
