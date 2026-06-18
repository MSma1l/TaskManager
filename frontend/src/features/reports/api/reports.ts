import client from '../../../shared/api/client';

/** Un punct din seria burndown (ideal vs actual, puncte story). */
export interface BurndownPoint {
  label: string;
  ideal: number;
  actual: number;
}

/** Linia per-membru din raportul de sprint. */
export interface ReportMember {
  userId: string;
  username: string | null;
  tasksDone: number;
  storyPointsDone: number;
  tasksPending: number;
}

/** Snapshot-ul stocat la inchiderea sprintului (sprint.report). */
export interface SprintReportData {
  totalTasks: number;
  completedTasks: number;
  completionPct: number;
  totalPoints: number;
  completedPoints: number;
  perMember: ReportMember[];
  burndown: BurndownPoint[];
  generatedAt: string;
}

/** Un raport de sprint inchis. */
export interface SprintReport {
  sprintId: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  closedAt: string | null;
  report: SprintReportData | null;
}

export const reportsApi = {
  list: (projectId: string) =>
    client.get<SprintReport[]>(`/projects/${projectId}/reports`).then((r) => r.data),
};
