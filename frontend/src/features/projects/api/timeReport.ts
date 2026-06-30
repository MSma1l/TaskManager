import client from '../../../shared/api/client';

/** One task row under a member, with the seconds that member spent on it. */
export interface TimeReportTask {
  taskId: string;
  taskKey: string | null;
  title: string;
  seconds: number;
}

/** Aggregated time for a single member across the project. */
export interface TimeReportMember {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl?: string | null;
  totalSeconds: number;
  taskCount: number;
  tasks: TimeReportTask[];
}

/** Per-project time report (owner-only). */
export interface TimeReport {
  totalSeconds: number;
  members: TimeReportMember[];
}

export const timeReportApi = {
  get: (projectId: string) =>
    client.get<TimeReport>(`/projects/${projectId}/time-report`).then((r) => r.data),
};
