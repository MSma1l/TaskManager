import client from '../../../shared/api/client';
import { SprintStatus } from './sprints';

export interface PerformanceMember {
  userId: string;
  username: string;
  completedPoints: number;
  completedTasks: number;
  assignedPoints: number;
  /** 0..1 ratio of completed vs assigned points. */
  completionRate: number;
}

export interface PerformanceSprint {
  sprintId: string;
  name: string;
  status: SprintStatus;
  committedPoints: number;
  completedPoints: number;
}

export interface Performance {
  perMember: PerformanceMember[];
  sprints: PerformanceSprint[];
  totals: {
    totalCompletedPoints: number;
    totalCommittedPoints: number;
  };
}

export const performanceApi = {
  getPerformance: (projectId: string) =>
    client.get<Performance>(`/projects/${projectId}/performance`).then((r) => r.data),
};
