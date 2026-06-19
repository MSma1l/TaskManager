import client from '../../../shared/api/client';

// ── Unions ───────────────────────────────────────────────────────────────────

export type BugStatus = 'OPEN' | 'IN_PROGRESS' | 'PASSED' | 'FAILED';
export type BugSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
/** Per-step result of executing a test step. */
export type BugStepResult = 'PASS' | 'FAIL' | null;

// ── Entities ─────────────────────────────────────────────────────────────────

export interface BugStep {
  id: string;
  text: string;
  done: boolean;
  result: BugStepResult;
}

export interface BugAttachment {
  id: string;
  /** base64 data URL (`data:image/...;base64,...`). */
  imageData: string;
  caption: string | null;
  createdAt: string;
}

export interface BugComment {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}

/** Lightweight row for the list/grid view. */
export interface BugReportSummary {
  id: string;
  title: string;
  status: BugStatus;
  severity: BugSeverity;
  attachmentCount: number;
  commentCount: number;
  stepsDone: number;
  stepsTotal: number;
  createdByName: string | null;
  assigneeName: string | null;
  createdAt: string;
}

/** Full report returned by the detail / mutation endpoints. */
export interface BugReportDetail {
  id: string;
  title: string;
  description: string | null;
  status: BugStatus;
  severity: BugSeverity;
  steps: BugStep[];
  attachments: BugAttachment[];
  comments: BugComment[];
  createdByName: string | null;
  assigneeName: string | null;
  assigneeId: string | null;
  createdAt: string;
}

// ── Request payloads ───────────────────────────────────────────────────────

export interface CreateBugReportData {
  title: string;
  description?: string;
  severity?: BugSeverity;
  steps?: { text: string }[];
}

/** Steps are sent back whole on update (add/remove/edit/toggle all funnel here). */
export interface UpdateBugReportStep {
  id?: string;
  text: string;
  done?: boolean;
  result?: BugStepResult;
}

export interface UpdateBugReportData {
  title?: string;
  description?: string;
  status?: BugStatus;
  severity?: BugSeverity;
  steps?: UpdateBugReportStep[];
  assigneeId?: string | null;
}

// ── API module ───────────────────────────────────────────────────────────────
// All field names are camelCase and isolated here: if the backend contract
// differs by a field name, this is the single place to adapt.

export const bugReportsApi = {
  list: (projectId: string, status?: BugStatus) =>
    client
      .get<BugReportSummary[]>(`/projects/${projectId}/bug-reports`, {
        params: status ? { status } : undefined,
      })
      .then((r) => r.data),

  get: (projectId: string, id: string) =>
    client
      .get<BugReportDetail>(`/projects/${projectId}/bug-reports/${id}`)
      .then((r) => r.data),

  create: (projectId: string, data: CreateBugReportData) =>
    client
      .post<BugReportDetail>(`/projects/${projectId}/bug-reports`, data)
      .then((r) => r.data),

  update: (projectId: string, id: string, data: UpdateBugReportData) =>
    client
      .put<BugReportDetail>(`/projects/${projectId}/bug-reports/${id}`, data)
      .then((r) => r.data),

  remove: (projectId: string, id: string) =>
    client
      .delete(`/projects/${projectId}/bug-reports/${id}`)
      .then((r) => r.data),

  addAttachment: (projectId: string, id: string, imageData: string, caption?: string) =>
    client
      .post<BugAttachment>(`/projects/${projectId}/bug-reports/${id}/attachments`, {
        imageData,
        caption,
      })
      .then((r) => r.data),

  removeAttachment: (projectId: string, id: string, attachmentId: string) =>
    client
      .delete(`/projects/${projectId}/bug-reports/${id}/attachments/${attachmentId}`)
      .then((r) => r.data),

  addComment: (projectId: string, id: string, body: string) =>
    client
      .post<BugComment>(`/projects/${projectId}/bug-reports/${id}/comments`, { body })
      .then((r) => r.data),

  removeComment: (projectId: string, id: string, commentId: string) =>
    client
      .delete(`/projects/${projectId}/bug-reports/${id}/comments/${commentId}`)
      .then((r) => r.data),
};
