import { BugStatus, BugSeverity, BugStep } from '../api/bugReports';

/** i18n key for a report status. */
export function statusKey(status: BugStatus): string {
  switch (status) {
    case 'OPEN':
      return 'qa.statusOpen';
    case 'IN_PROGRESS':
      return 'qa.statusInProgress';
    case 'PASSED':
      return 'qa.statusPassed';
    case 'FAILED':
      return 'qa.statusFailed';
  }
}

/** Tailwind classes for a status badge (semantic colors only). */
export function statusColor(status: BugStatus): string {
  switch (status) {
    case 'PASSED':
      return 'bg-green-500/15 text-green-400';
    case 'FAILED':
      return 'bg-red-500/15 text-red-400';
    case 'IN_PROGRESS':
      return 'bg-amber-500/15 text-amber-400';
    case 'OPEN':
      return 'bg-surface text-muted border border-border';
  }
}

/** i18n key for a severity. */
export function severityKey(severity: BugSeverity): string {
  switch (severity) {
    case 'LOW':
      return 'qa.severityLow';
    case 'MEDIUM':
      return 'qa.severityMedium';
    case 'HIGH':
      return 'qa.severityHigh';
    case 'CRITICAL':
      return 'qa.severityCritical';
  }
}

/** Tailwind classes for a severity chip. */
export function severityColor(severity: BugSeverity): string {
  switch (severity) {
    case 'LOW':
      return 'bg-surface text-muted border border-border';
    case 'MEDIUM':
      return 'bg-blue-500/15 text-blue-400';
    case 'HIGH':
      return 'bg-amber-500/15 text-amber-400';
    case 'CRITICAL':
      return 'bg-red-500/15 text-red-400';
  }
}

export interface StepsProgress {
  done: number;
  total: number;
  /** 0..1 ratio of completed steps (0 when there are no steps). */
  ratio: number;
}

/** Counts completed steps (a step counts as done when `done` is true). */
export function stepsProgress(steps: BugStep[]): StepsProgress {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const ratio = total > 0 ? done / total : 0;
  return { done, total, ratio };
}

export const ALL_STATUSES: BugStatus[] = ['OPEN', 'IN_PROGRESS', 'PASSED', 'FAILED'];
export const ALL_SEVERITIES: BugSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
