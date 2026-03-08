import client from '../../../shared/api/client';

export interface WeeklyStats {
  total: number;
  done: number;
  skipped: number;
  notDone: number;
  percentage: number;
}

export interface WeekHistory {
  weekStart: string;
  total: number;
  done: number;
  percentage: number;
}

export interface TaskStreak {
  taskId: string;
  taskTitle: string;
  streak: number;
}

export interface MissedTask {
  taskId: string;
  taskTitle: string;
  missedCount: number;
}

export const statsApi = {
  getWeekly: (weekStart?: string) =>
    client.get<WeeklyStats>('/stats/weekly', { params: { weekStart } }).then((r) => r.data),
  getHistory: () => client.get<WeekHistory[]>('/stats/history').then((r) => r.data),
  getStreaks: () => client.get<TaskStreak[]>('/stats/streaks').then((r) => r.data),
  getMissed: () => client.get<MissedTask[]>('/stats/missed').then((r) => r.data),
};
