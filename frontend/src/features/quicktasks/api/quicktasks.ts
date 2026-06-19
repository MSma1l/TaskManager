import axios from 'axios';
import client from '../../../shared/api/client';

export type QuickTaskPriority = 'URGENT' | 'NORMAL' | 'LATER';
export type QuickTaskStatus = 'NEW' | 'ASSIGNED' | 'DISMISSED';

/**
 * Atașament trimis odată cu un quick task public. `data` e un data-URL base64
 * (ex: `data:image/png;base64,...` sau `data:audio/webm;base64,...`).
 */
export interface QuickTaskAttachment {
  type: 'image' | 'audio';
  data: string;
  caption?: string | null;
}

export interface QuickTask {
  id: string;
  requesterName: string;
  title: string;
  description: string | null;
  priority: QuickTaskPriority;
  status: QuickTaskStatus;
  projectId: string | null;
  assigneeId: string | null;
  taskId: string | null;
  processedByUserId: string | null;
  processedAt: string | null;
  createdAt: string | null;
  attachments?: QuickTaskAttachment[];
}

export interface QuickTaskCreate {
  requesterName: string;
  title: string;
  description?: string;
  priority: QuickTaskPriority;
  attachments?: QuickTaskAttachment[];
}

/**
 * Instanta axios "goala" pentru submit-ul PUBLIC: fara interceptorul de auth al
 * clientului partajat, ca un token expirat din localStorage sa nu declanseze
 * redirect-ul de sesiune pe o pagina care nu cere login.
 */
const publicClient = axios.create({ baseURL: '/api' });

export const quickTasksApi = {
  submitPublic: (data: QuickTaskCreate) =>
    publicClient.post<{ id: string; ok: boolean }>('/quick-tasks/public', data).then((r) => r.data),
  list: (status: QuickTaskStatus | 'ALL' = 'NEW') =>
    client.get<QuickTask[]>('/quick-tasks', { params: { status } }).then((r) => r.data),
  assign: (id: string, projectId: string, assigneeId: string) =>
    client
      .post(`/quick-tasks/${id}/assign`, { projectId, assigneeId })
      .then((r) => r.data),
  dismiss: (id: string) => client.post(`/quick-tasks/${id}/dismiss`).then((r) => r.data),
  /** Numarul de quick task-uri NEW (badge sidebar; 0 pentru ne-admini). */
  count: () => client.get<{ count: number }>('/quick-tasks/count').then((r) => r.data.count),
};
