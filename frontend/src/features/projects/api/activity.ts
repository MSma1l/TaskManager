import client from '../../../shared/api/client';

export type ActivityAction =
  | 'CREATED'
  | 'MOVED'
  | 'ASSIGNED'
  | 'PLANNED'
  | 'STARTED'
  | 'DONE'
  | 'APPROVED'
  | 'COMMENTED';

export interface TaskActivity {
  id: string;
  action: ActivityAction | string;
  meta: Record<string, unknown> | null;
  userId: string | null;
  username: string | null;
  createdAt: string;
}

/** Project-level activity: same shape as TaskActivity plus the originating task. */
export interface ProjectActivity extends TaskActivity {
  taskId: string | null;
}

export const activityApi = {
  list: (taskId: string) =>
    client.get<TaskActivity[]>(`/tasks/${taskId}/activity`).then((r) => r.data),
  projectActivity: (projectId: string, limit = 50) =>
    client
      .get<ProjectActivity[]>(`/projects/${projectId}/activity`, { params: { limit } })
      .then((r) => r.data),
};
