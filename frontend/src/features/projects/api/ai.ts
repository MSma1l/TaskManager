import client from '../../../shared/api/client';
import { BoardTask } from './board';

/** Where the AI result came from — a real model ('AI') or the rule-based fallback ('reguli'). */
export type AiSource = string;

export interface AiQuestion {
  id: string;
  text: string;
}

export interface TaskQuestionsResult {
  questions: AiQuestion[];
  source: AiSource;
}

/** Answers keyed by question id. */
export type AiAnswers = Record<string, string>;

export interface EstimateResult {
  storyPoints: number;
  rationale: string;
  shouldSplit: boolean;
  suggestedSubtasks: string[];
  source: AiSource;
}

export interface CreateAiTaskResult {
  task: BoardTask;
  estimate: EstimateResult;
}

export const aiApi = {
  taskQuestions: (data: { title: string; description?: string }) =>
    client.post<TaskQuestionsResult>(`/ai/task-questions`, data).then((r) => r.data),
  estimate: (
    projectId: string,
    data: { title: string; description?: string; answers: AiAnswers },
  ) =>
    client
      .post<EstimateResult>(`/projects/${projectId}/ai/estimate`, data)
      .then((r) => r.data),
  createTask: (
    projectId: string,
    data: {
      title: string;
      description?: string;
      answers: AiAnswers;
      columnId?: string;
      assigneeId?: string;
    },
  ) =>
    client
      .post<CreateAiTaskResult>(`/projects/${projectId}/ai/create-task`, data)
      .then((r) => r.data),
};
