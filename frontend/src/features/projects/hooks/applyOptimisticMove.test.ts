import { describe, expect, it } from 'vitest';
import { applyOptimisticMove } from './applyOptimisticMove';
import { Board, BoardColumn, BoardTask } from '../api/board';

function task(id: string, columnId: string): BoardTask {
  return {
    id,
    title: id,
    description: null,
    priority: 'MEDIUM',
    assignee: null,
    assignees: [],
    labels: [],
    boardColumnId: columnId,
    boardOrder: 0,
    commentCount: 0,
    taskNumber: null,
    taskKey: null,
    dueDate: null,
    estimateMinutes: null,
    dayOfWeek: null,
    scheduledDate: null,
    storyPoints: null,
    sprintId: null,
    approvalStatus: null,
    subtasks: [],
    zone: 'BACKLOG',
    zoneOverride: null,
    daysRemaining: null,
    timeSpentSeconds: 0,
    runningTimers: [],
  };
}

function column(id: string, taskIds: string[]): BoardColumn {
  return {
    id,
    name: id,
    position: 0,
    color: null,
    isDoneColumn: false,
    columnType: null,
    tasks: taskIds.map((tid) => task(tid, id)),
  };
}

function board(): Board {
  return {
    labels: [],
    columns: [column('c1', ['a', 'b', 'c']), column('c2', ['x', 'y'])],
  };
}

const ids = (col: BoardColumn) => col.tasks.map((t) => t.id);

describe('applyOptimisticMove', () => {
  it('reorders within the same column', () => {
    const res = applyOptimisticMove(board(), 'a', 'c1', 2)!;
    expect(ids(res.columns[0])).toEqual(['b', 'c', 'a']);
    expect(ids(res.columns[1])).toEqual(['x', 'y']);
  });

  it('moves a task across columns and inserts at the index', () => {
    const res = applyOptimisticMove(board(), 'a', 'c2', 1)!;
    expect(ids(res.columns[0])).toEqual(['b', 'c']);
    expect(ids(res.columns[1])).toEqual(['x', 'a', 'y']);
  });

  it('updates the moved task boardColumnId to the destination', () => {
    const res = applyOptimisticMove(board(), 'a', 'c2', 0)!;
    const moved = res.columns[1].tasks.find((t) => t.id === 'a')!;
    expect(moved.boardColumnId).toBe('c2');
  });

  it('clamps an out-of-range index to the column bounds', () => {
    const res = applyOptimisticMove(board(), 'a', 'c2', 99)!;
    expect(ids(res.columns[1])).toEqual(['x', 'y', 'a']);
  });

  it('clamps a negative index to 0', () => {
    const res = applyOptimisticMove(board(), 'a', 'c2', -5)!;
    expect(ids(res.columns[1])).toEqual(['a', 'x', 'y']);
  });

  it('returns null when the board is null', () => {
    expect(applyOptimisticMove(null, 'a', 'c2', 0)).toBeNull();
  });

  it('returns the original reference when the task is not found', () => {
    const original = board();
    expect(applyOptimisticMove(original, 'missing', 'c2', 0)).toBe(original);
  });

  it('returns the original reference when the target column is missing', () => {
    const original = board();
    expect(applyOptimisticMove(original, 'a', 'no-col', 0)).toBe(original);
  });

  it('does not mutate the input board', () => {
    const original = board();
    const snapshot = original.columns.map((c) => ids(c));
    applyOptimisticMove(original, 'a', 'c2', 0);
    expect(original.columns.map((c) => ids(c))).toEqual(snapshot);
  });
});
