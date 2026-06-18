import client from '../../../shared/api/client';

export interface MonthlyPoints {
  month: string; // "YYYY-MM"
  points: number;
}

export interface MyPoints {
  careerStoryPoints: number;
  tasksFinished: {
    total: number;
    month: number; // last 30d
    quarter: number; // last 90d
    year: number; // last 365d
  };
  storyPointsThisWeek: number;
  storyPointsLastWeek: number;
  trend: 'up' | 'down' | 'flat';
  trendDelta: number;
  monthlySeries: MonthlyPoints[];
}

export interface TeamMemberPoints {
  userId: string;
  username: string | null;
  role: string;
  storyPoints: number;
  tasksFinished: number;
  assignedTasks: number;
  completionRate: number; // 0..1
}

export interface TeamPoints {
  projectId: string;
  perMember: TeamMemberPoints[];
  recommendations: string[];
}

export const metricsApi = {
  getMyPoints: () => client.get<MyPoints>('/stats/me/points').then((r) => r.data),
  getTeamPoints: (projectId: string) =>
    client.get<TeamPoints>('/stats/team/points', { params: { projectId } }).then((r) => r.data),
};
