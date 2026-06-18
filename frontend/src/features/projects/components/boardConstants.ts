import { BoardPriority, ColumnType, TransitionAction } from '../api/board';

/** Column accent / label color palette (shared by ColumnModal + LabelPicker). */
export const BOARD_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#14b8a6', '#a855f7', '#64748b', '#f43f5e',
];

export const PRIORITIES: BoardPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/** Dot color per priority (Tailwind class). */
export const PRIORITY_DOT: Record<BoardPriority, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-400',
  HIGH: 'bg-orange-400',
  URGENT: 'bg-red-500',
};

export function priorityKey(p: BoardPriority): string {
  switch (p) {
    case 'LOW': return 'board.priorityLow';
    case 'MEDIUM': return 'board.priorityMedium';
    case 'HIGH': return 'board.priorityHigh';
    case 'URGENT': return 'board.priorityUrgent';
  }
}

/** Deterministic avatar tint based on a string (username/userId). */
const AVATAR_TINTS = [
  'bg-blue-600/25 text-blue-300',
  'bg-purple-600/25 text-purple-300',
  'bg-pink-600/25 text-pink-300',
  'bg-orange-600/25 text-orange-300',
  'bg-green-600/25 text-green-300',
  'bg-cyan-600/25 text-cyan-300',
];

export function avatarTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

/** Number of distinct avatar tint buckets (exposed for tests). */
export const AVATAR_TINTS_COUNT = AVATAR_TINTS.length;

/** Selectable column types (order = the canonical workflow). */
export const COLUMN_TYPES: ColumnType[] = [
  'BACKLOG',
  'PLANNED',
  'IN_PROGRESS',
  'VERIFY',
  'DONE',
  'APPROVED',
  'CUSTOM',
];

/** i18n key for a column type label. */
export function columnTypeKey(ct: ColumnType): string {
  switch (ct) {
    case 'BACKLOG': return 'board.ctBacklog';
    case 'PLANNED': return 'board.ctPlanned';
    case 'IN_PROGRESS': return 'board.ctInProgress';
    case 'VERIFY': return 'board.ctVerify';
    case 'DONE': return 'board.ctDone';
    case 'APPROVED': return 'board.ctApproved';
    case 'CUSTOM': return 'board.ctCustom';
  }
}

/** i18n key for a workflow action button label. */
export function actionKey(a: TransitionAction): string {
  switch (a) {
    case 'plan': return 'board.plan';
    case 'start': return 'board.takeInWork';
    case 'done': return 'board.reportDone';
    case 'approve': return 'board.approve';
  }
}

/**
 * The workflow action contextually available from a given column type.
 * Returns null when no transition button should be shown.
 *
 * `done` = "Raportează ca Finalizat" (mută în VERIFY, status PENDING_REVIEW);
 * `approve` (din VERIFY/DONE) e validarea adminului.
 */
export function nextAction(ct: ColumnType | null): TransitionAction | null {
  switch (ct) {
    case 'BACKLOG': return 'plan';
    case 'PLANNED': return 'start';
    case 'IN_PROGRESS': return 'done';
    case 'VERIFY': return 'approve';
    case 'DONE': return 'approve';
    default: return null;
  }
}
