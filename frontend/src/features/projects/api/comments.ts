import client from '../../../shared/api/client';

export interface TaskComment {
  id: string;
  body: string;
  userId: string;
  username: string;
  fullName: string | null;
  createdAt: string;
  updatedAt: string;
}

export const commentsApi = {
  list: (taskId: string) =>
    client.get<TaskComment[]>(`/tasks/${taskId}/comments`).then((r) => r.data),
  create: (taskId: string, body: string) =>
    client.post<TaskComment>(`/tasks/${taskId}/comments`, { body }).then((r) => r.data),
  update: (taskId: string, commentId: string, body: string) =>
    client
      .put<TaskComment>(`/tasks/${taskId}/comments/${commentId}`, { body })
      .then((r) => r.data),
  remove: (taskId: string, commentId: string) =>
    client.delete(`/tasks/${taskId}/comments/${commentId}`).then((r) => r.data),
};
