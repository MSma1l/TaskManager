import client from '../../../shared/api/client';

export interface Topic {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  isPredefined: boolean;
  ideaCount: number;
  createdAt: string | null;
}

export interface Note {
  id: string;
  noteType: 'step' | 'task' | 'idea';
  topicId: string | null;
  content: string;
  stepOrder: number | null;
  taskStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const notebookApi = {
  // Topics
  getTopics: () => client.get<Topic[]>('/notebook/topics').then((r) => r.data),
  createTopic: (data: { name: string; emoji?: string; description?: string }) =>
    client.post<Topic>('/notebook/topics', data).then((r) => r.data),
  updateTopic: (id: string, data: { name?: string; emoji?: string; description?: string }) =>
    client.put<Topic>(`/notebook/topics/${id}`, data).then((r) => r.data),
  deleteTopic: (id: string) => client.delete(`/notebook/topics/${id}`),

  // Steps
  getSteps: () => client.get<Note[]>('/notebook/steps').then((r) => r.data),
  addStep: (content: string) =>
    client.post<Note>('/notebook/steps', { content }).then((r) => r.data),

  // Tasks
  getTasks: (status?: string) =>
    client.get<Note[]>('/notebook/tasks', { params: status ? { status } : {} }).then((r) => r.data),
  addTask: (content: string, taskStatus?: string) =>
    client.post<Note>('/notebook/tasks', { content, taskStatus }).then((r) => r.data),

  // Ideas
  getIdeas: (topicId: string) =>
    client.get<Note[]>(`/notebook/ideas/${topicId}`).then((r) => r.data),
  addIdea: (topicId: string, content: string) =>
    client.post<Note>(`/notebook/ideas/${topicId}`, { content }).then((r) => r.data),

  // Notes (edit/delete any type)
  updateNote: (id: string, data: { content?: string; taskStatus?: string }) =>
    client.put<Note>(`/notebook/notes/${id}`, data).then((r) => r.data),
  deleteNote: (id: string) => client.delete(`/notebook/notes/${id}`),
};
