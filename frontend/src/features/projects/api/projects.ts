import client from '../../../shared/api/client';
import { Task } from '../../tasks/api/tasks';
import { ProjectRole } from './members';

export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'ARCHIVED';

/** Priority zone — manual choice, only used when the project has no deadline. */
export type ProjectPriority = 'URGENT' | 'MEDIUM' | 'NORMAL' | 'BACKLOG';
/** Computed zone the project lands in. Always present (server-side). */
export type ProjectZone = 'URGENT' | 'MEDIUM' | 'NORMAL' | 'BACKLOG';

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
  /** ISO8601 deadline, or null when the project has no termen (BACKLOG). */
  deadline: string | null;
  /** Manual priority zone — only meaningful when `deadline` is null. */
  priority: ProjectPriority | null;
  /** Zone computed server-side from deadline (or priority when no deadline). Always present. */
  zone: ProjectZone;
  /** Whole days until deadline; negative if overdue, null when no deadline. */
  daysRemaining: number | null;
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
  /** ISO string, or null to leave without a termen (BACKLOG). */
  deadline?: string | null;
  /** Manual zone when there is no deadline. */
  priority?: ProjectPriority | null;
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
  /** ISO string, or null to clear the termen (→ BACKLOG). */
  deadline?: string | null;
  /** Manual zone when there is no deadline. */
  priority?: ProjectPriority | null;
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
