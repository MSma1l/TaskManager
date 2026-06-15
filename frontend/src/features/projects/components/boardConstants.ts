import { BoardPriority } from '../api/board';

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
