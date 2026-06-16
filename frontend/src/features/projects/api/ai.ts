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
}

/** A single AI-proposed task in a sprint plan (preview, not yet persisted). */
export interface PlannedTask {
  title: string;
  description: string;
  storyPoints: number;
}

export interface PlanResult {
  tasks: PlannedTask[];
  source: AiSource;
}

/** Payload for applying a (possibly edited) plan — backlog column resolved server-side. */
export interface ApplyPlanTask {
  title: string;
  description?: string;
  storyPoints?: number;
  columnId?: string;
}

export interface ApplyPlanResult {
  created: BoardTask[];
  count: number;
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
      storyPoints?: number;
      columnId?: string;
      assigneeId?: string;
    },
  ) =>
    client
      .post<CreateAiTaskResult>(`/projects/${projectId}/ai/create-task`, data)
      .then((r) => r.data),
  planSprint: (projectId: string, brief: string) =>
    client
      .post<PlanResult>(`/projects/${projectId}/ai/plan`, { brief })
      .then((r) => r.data),
  applyPlan: (projectId: string, tasks: ApplyPlanTask[]) =>
    client
      .post<ApplyPlanResult>(`/projects/${projectId}/ai/plan/apply`, { tasks })
      .then((r) => r.data),
};
