import client from '../../../shared/api/client';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Completion {
  id: string;
  taskId: string;
  weekStart: string;
  status: 'PENDING' | 'DONE' | 'SKIPPED' | 'NOT_DONE';
  completedAt: string | null;
  movedToDate: string | null;
  skipReason: string | null;
  note: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  category: Category;
  dayOfWeek: number;
  scheduledDate: string | null;
  reminderTime: string | null;
  isRecurring: boolean;
  isActive: boolean;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimatedMinutes: number | null;
  projectId: string | null;
  completions: Completion[];
}

export interface CreateTaskData {
  title: string;
  description?: string;
  categoryId: string;
  dayOfWeek: number;
  scheduledDate?: string;
  reminderTime?: string;
  isRecurring?: boolean;
  priority?: string;
  estimatedMinutes?: number;
  projectId?: string;
}

export const tasksApi = {
  getAll: () => client.get<Task[]>('/tasks').then((r) => r.data),
  getWeek: (date?: string) => client.get<Task[]>('/tasks/week', { params: { date } }).then((r) => r.data),
  create: (data: CreateTaskData) => client.post<Task>('/tasks', data).then((r) => r.data),
  update: (id: string, data: Partial<CreateTaskData>) => client.put<Task>(`/tasks/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/tasks/${id}`),
};
