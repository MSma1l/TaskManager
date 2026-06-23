import client from '../../../shared/api/client';
import { Task } from '../../tasks/api/tasks';
import { ProjectRole } from './members';

export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'ARCHIVED';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  githubUrl: string | null;
  color: string;
  key: string | null;
  isActive: boolean;
  status: ProjectStatus;
  /** Admin/owner flag: my tasks from this project feed the shared Today board. */
  showOnToday: boolean;
  taskCount: number;
  /** Caller's role on this project (Phase 1 membership). */
  role?: ProjectRole;
  /** Number of members on this project. */
  memberCount?: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProjectWithTasks extends Project {
  tasks: Task[];
}

export interface CreateProjectData {
  name: string;
  description?: string;
  githubUrl?: string;
  color?: string;
  key?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  githubUrl?: string;
  color?: string;
  key?: string;
  isActive?: boolean;
  status?: ProjectStatus;
  showOnToday?: boolean;
}

export const projectsApi = {
  getAll: (statuses?: ProjectStatus[]) =>
    client
      .get<Project[]>('/projects', {
        params: statuses && statuses.length ? { status: statuses.join(',') } : undefined,
      })
      .then((r) => r.data),
  getOne: (id: string) => client.get<ProjectWithTasks>(`/projects/${id}`).then((r) => r.data),
  create: (data: CreateProjectData) => client.post<Project>('/projects', data).then((r) => r.data),
  update: (id: string, data: UpdateProjectData) => client.put<Project>(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/projects/${id}`),
};
