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

/**
 * Project-level activity: same shape as TaskActivity plus the originating task
 * and a few enriched fields (title/priority/status) used for display + sorting.
 */
export interface ProjectActivity extends TaskActivity {
  taskId: string | null;
  taskTitle?: string | null;
  taskPriority?: string | null;
  /** Column type (or name) of the task's current board column. */
  taskStatus?: string | null;
  /** Human-readable board column name. */
  taskStatusName?: string | null;
}

/** Sort options for the project activity feed (must match the backend). */
export type ActivitySort = 'recent' | 'person' | 'date' | 'status' | 'priority';

/** Optional filters/sorting for the project activity feed. */
export interface ProjectActivityOptions {
  /** Type filter: a concrete action ("CREATED", "COMMENTED") or a group ("STATUS_CHANGE"). */
  action?: string;
  /** Person filter: actor user id. */
  user?: string;
  sort?: ActivitySort;
}

export const activityApi = {
  list: (taskId: string) =>
    client.get<TaskActivity[]>(`/tasks/${taskId}/activity`).then((r) => r.data),
  projectActivity: (projectId: string, limit = 50, opts?: ProjectActivityOptions) =>
    client
      .get<ProjectActivity[]>(`/projects/${projectId}/activity`, {
        params: {
          limit,
          action: opts?.action || undefined,
          user: opts?.user || undefined,
          sort: opts?.sort || undefined,
        },
      })
      .then((r) => r.data),
};
