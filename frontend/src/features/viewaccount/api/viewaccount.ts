import axios from 'axios';
import client from '../../../shared/api/client';

/** Scope-ul unui link de share. */
export type ShareScope = 'team' | 'project';

/** Un link de share (creat de userul curent). */
export interface ReportShare {
  id: string;
  token: string;
  scope: ShareScope;
  projectId: string | null;
  label: string | null;
  isActive: boolean;
  createdAt: string | null;
  /** Cale relativa, ex: "/view/<token>". */
  path: string;
}

export interface CreateShareData {
  scope: ShareScope;
  projectId?: string | null;
  label?: string | null;
}

// ── tipuri payload public ────────────────────────────────────────────

export interface PublicReportMember {
  userId: string;
  username: string | null;
  tasksDone: number;
  storyPointsDone: number;
  tasksPending: number;
}

export interface BurndownPoint {
  label: string;
  ideal: number;
  actual: number;
}

export interface SprintReportData {
  totalTasks: number;
  completedTasks: number;
  completionPct: number;
  totalPoints: number;
  completedPoints: number;
  perMember: PublicReportMember[];
  burndown: BurndownPoint[];
  generatedAt: string;
}

export interface CompletedSprintReport {
  sprintId: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  closedAt: string | null;
  report: SprintReportData | null;
}

export interface ActiveSprintPerformance {
  sprintId: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  totalTasks: number;
  completedTasks: number;
  completionPct: number;
  totalPoints: number;
  completedPoints: number;
}

export interface PublicProject {
  id: string;
  name: string;
  status: string;
  color: string;
  completedSprintCount: number;
  activeSprintCount: number;
  totalCompletedTasks: number;
  totalCompletedPoints: number;
  sprintReports: CompletedSprintReport[];
  activeSprints: ActiveSprintPerformance[];
  memberProductivity: PublicReportMember[];
}

export interface PublicReport {
  scope: ShareScope;
  label: string | null;
  generatedAt: string;
  projects: PublicProject[];
  teamMemberProductivity: PublicReportMember[];
}

// ── authed API (creator) ─────────────────────────────────────────────

export const viewAccountApi = {
  createShare: (data: CreateShareData) =>
    client.post<ReportShare>('/report-shares', data).then((r) => r.data),
  listShares: () =>
    client.get<ReportShare[]>('/report-shares').then((r) => r.data),
  revokeShare: (id: string) =>
    client.post(`/report-shares/${id}/revoke`).then((r) => r.data),
};

// ── public API (NO auth interceptor) ─────────────────────────────────

/**
 * Instanta axios separata, FARA interceptorul de auth: un token lipsa/expirat
 * nu trebuie sa declanseze redirect catre login pentru un vizitator public.
 */
const publicClient = axios.create({ baseURL: '/api' });

export function getPublicReport(token: string): Promise<PublicReport> {
  return publicClient
    .get<PublicReport>(`/report-shares/public/${token}`)
    .then((r) => r.data);
}
