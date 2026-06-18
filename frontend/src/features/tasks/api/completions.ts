import client from '../../../shared/api/client';

export const completionsApi = {
  markDone: (taskId: string, note?: string, weekStart?: string) =>
    client.post(`/completions/${taskId}/done`, { note, weekStart }).then((r) => r.data),

  markSkip: (taskId: string, movedToDate: string, skipReason?: string, weekStart?: string) =>
    client.post(`/completions/${taskId}/skip`, { movedToDate, skipReason, weekStart }).then((r) => r.data),

  markNotDone: (taskId: string, skipReason: string, weekStart?: string) =>
    client.post(`/completions/${taskId}/not-done`, { skipReason, weekStart }).then((r) => r.data),

  moveTask: (taskId: string, movedToDate: string, note?: string, weekStart?: string) =>
    client.post(`/completions/${taskId}/move`, { movedToDate, note, weekStart }).then((r) => r.data),

  // Marcheaza „luat in lucru" (PENDING + nota). Nota goala = reset la „De facut".
  start: (taskId: string, note?: string, weekStart?: string) =>
    client.post(`/completions/${taskId}/start`, { note, weekStart }).then((r) => r.data),
};
