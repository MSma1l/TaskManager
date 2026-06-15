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

export const activityApi = {
  list: (taskId: string) =>
    client.get<TaskActivity[]>(`/tasks/${taskId}/activity`).then((r) => r.data),
};
