import client from '../../../shared/api/client';

export interface TaskWatcher {
  userId: string;
  username: string;
}

export const watchersApi = {
  list: (taskId: string) =>
    client.get<TaskWatcher[]>(`/tasks/${taskId}/watchers`).then((r) => r.data),
  watch: (taskId: string) =>
    client.post(`/tasks/${taskId}/watch`).then((r) => r.data),
  unwatch: (taskId: string) =>
    client.delete(`/tasks/${taskId}/watch`).then((r) => r.data),
};
