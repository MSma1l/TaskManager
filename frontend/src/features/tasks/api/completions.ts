import client from '../../../shared/api/client';

export const completionsApi = {
  markDone: (taskId: string, note?: string) =>
    client.post(`/completions/${taskId}/done`, { note }).then((r) => r.data),

  markSkip: (taskId: string, movedToDate: string, skipReason?: string) =>
    client.post(`/completions/${taskId}/skip`, { movedToDate, skipReason }).then((r) => r.data),

  markNotDone: (taskId: string, skipReason: string) =>
    client.post(`/completions/${taskId}/not-done`, { skipReason }).then((r) => r.data),

  moveTask: (taskId: string, movedToDate: string, note?: string) =>
    client.post(`/completions/${taskId}/move`, { movedToDate, note }).then((r) => r.data),
};
