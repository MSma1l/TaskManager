import { Board, BoardColumn, BoardTask } from '../api/board';

/**
 * Pure reducer for the optimistic drag-and-drop move on a board.
 *
 * Removes `taskId` from whatever column currently holds it and inserts it into
 * `toColumnId` at `toIndex` (clamped to the target column bounds). The task's
 * `boardColumnId` is updated to the destination. Columns and their task arrays
 * are copied so the original `board` is never mutated.
 *
 * Returns the original reference unchanged when the board is missing, the task
 * can't be found, or the target column doesn't exist — mirroring the previous
 * inline `setBoard` behavior.
 */
export function applyOptimisticMove(
  board: Board | null,
  taskId: string,
  toColumnId: string,
  toIndex: number,
): Board | null {
  if (!board) return board;

  const columns: BoardColumn[] = board.columns.map((c) => ({ ...c, tasks: [...c.tasks] }));

  let moved: BoardTask | undefined;
  for (const col of columns) {
    const idx = col.tasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      moved = col.tasks.splice(idx, 1)[0];
      break;
    }
  }
  if (!moved) return board;

  const target = columns.find((c) => c.id === toColumnId);
  if (!target) return board;

  const safeIndex = Math.max(0, Math.min(toIndex, target.tasks.length));
  target.tasks.splice(safeIndex, 0, { ...moved, boardColumnId: toColumnId });

  return { ...board, columns };
}
