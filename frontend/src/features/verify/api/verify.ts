import client from '../../../shared/api/client';
import { ApprovalStatus, BoardAssignee, BoardPriority, Label } from '../../projects/api/board';

export interface PendingProject {
  id: string;
  name: string;
  color: string | null;
  key: string | null;
}

/** Un task raportat ca finalizat, în așteptarea verificării adminului. */
export interface PendingTask {
  id: string;
  title: string;
  description: string | null;
  priority: BoardPriority;
  assignee: BoardAssignee | null;
  labels: Label[];
  storyPoints: number | null;
  approvalStatus: ApprovalStatus | null;
  taskKey: string | null;
  taskNumber: number | null;
  commentCount: number;
  project: PendingProject | null;
  projectId: string;
}

export const verifyApi = {
  listPending: () =>
    client.get<PendingTask[]>('/tasks/pending-verification').then((r) => r.data),
  approve: (taskId: string) =>
    client.post(`/tasks/${taskId}/approve`).then((r) => r.data),
  returnToFix: (taskId: string, reason: string) =>
    client.post(`/tasks/${taskId}/return`, { reason }).then((r) => r.data),
  reject: (taskId: string, reason: string) =>
    client.post(`/tasks/${taskId}/reject`, { reason }).then((r) => r.data),
};
