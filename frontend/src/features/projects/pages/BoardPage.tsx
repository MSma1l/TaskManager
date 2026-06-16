import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useBoard } from '../hooks/useBoard';
import { useMembers } from '../hooks/useMembers';
import { useSprints } from '../hooks/useSprints';
import { BoardColumn as Column, BoardTask, TransitionAction, TransitionData } from '../api/board';
import { ProjectRole } from '../api/members';
import MembersBar from '../components/MembersBar';
import BoardColumn from '../components/BoardColumn';
import { BoardCardBody } from '../components/BoardCard';
import ColumnModal from '../components/ColumnModal';
import BoardTaskModal from '../components/BoardTaskModal';
import PlanTaskModal from '../components/PlanTaskModal';
import BoardTour from '../components/BoardTour';
import TaskDetailDrawer from '../components/TaskDetailDrawer';

interface BoardPageProps {
  /** Optional — when omitted, read from route. Lets the page be embedded as a tab. */
  projectId?: string;
  myRole?: ProjectRole;
}

export default function BoardPage({ projectId: propProjectId, myRole }: BoardPageProps) {
  const t = useT();
  const params = useParams<{ projectId: string }>();
  const projectId = propProjectId || params.projectId || '';

  // Sprint scope: '' = all, 'backlog' = backlog only, else a sprint id.
  const [sprintFilter, setSprintFilter] = useState('');
  const { sprints } = useSprints(projectId);

  const {
    board,
    loading,
    setDragging,
    createColumn,
    updateColumn,
    deleteColumn,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    assignTask,
    transitionTask,
    createLabel,
  } = useBoard(projectId, sprintFilter || undefined);
  const { members } = useMembers(projectId);

  const canManage = myRole === 'OWNER' || myRole === 'ADMIN' || myRole === 'MEMBER' || myRole === undefined;
  const canApprove = myRole === 'OWNER' || myRole === 'ADMIN' || myRole === undefined;
  const myUserId = useMemo(() => members.find((m) => m.isYou)?.userId ?? null, [members]);

  // UI state
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterLabel, setFilterLabel] = useState<string | null>(null);

  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editColumn, setEditColumn] = useState<Column | null>(null);
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<Column | null>(null);
  const [deleteColError, setDeleteColError] = useState('');

  const [addCardColumn, setAddCardColumn] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<BoardTask | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [planTask, setPlanTask] = useState<BoardTask | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  // The card currently shown in the detail drawer, resolved live from the board
  // so it reflects polled updates (comment count, assignee, column moves…).
  const detailTask = useMemo(
    () =>
      detailTaskId
        ? board?.columns.flatMap((c) => c.tasks).find((tk) => tk.id === detailTaskId) ?? null
        : null,
    [detailTaskId, board],
  );
  const detailColumn = useMemo(
    () =>
      detailTask
        ? board?.columns.find((c) => c.id === detailTask.boardColumnId) ?? null
        : null,
    [detailTask, board],
  );

  // ── Workflow transitions ────────────────────────────────────────────────────
  const handleWorkflowAction = (task: BoardTask, action: TransitionAction) => {
    if (action === 'plan') {
      setPlanTask(task);
      return;
    }
    transitionTask(task.id, { action });
  };

  const handlePlanSubmit = async (data: TransitionData) => {
    if (!planTask) return;
    await transitionTask(planTask.id, data);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Client-side filtering (search + assignee + label).
  const filterTasks = (tasks: BoardTask[]): BoardTask[] =>
    tasks.filter((tk) => {
      if (search && !tk.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterAssignee && tk.assignee?.userId !== filterAssignee) return false;
      if (filterLabel && !tk.labels.some((l) => l.id === filterLabel)) return false;
      return true;
    });

  const columns = useMemo(
    () => (board ? [...board.columns].sort((a, b) => a.position - b.position) : []),
    [board],
  );

  // ── Drag ──────────────────────────────────────────────────────────────────
  const findTask = (id: string): BoardTask | undefined =>
    board?.columns.flatMap((c) => c.tasks).find((tk) => tk.id === id);

  const handleDragStart = (e: DragStartEvent) => {
    setDragging(true);
    const tk = findTask(String(e.active.id));
    if (tk) setActiveTask(tk);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) { setDragging(false); return; }

    const activeId = String(active.id);
    const overId = String(over.id);
    const moved = findTask(activeId);
    if (!moved) { setDragging(false); return; }

    // Determine destination column + index.
    let toColumnId: string;
    let toIndex: number;

    const overTask = findTask(overId);
    if (overTask) {
      toColumnId = overTask.boardColumnId;
      const destCol = board?.columns.find((c) => c.id === toColumnId);
      const ordered = destCol ? [...destCol.tasks].sort((a, b) => a.boardOrder - b.boardOrder) : [];
      toIndex = ordered.findIndex((tk) => tk.id === overId);
      if (toIndex === -1) toIndex = ordered.length;
    } else {
      // Dropped over a column container.
      toColumnId = overId;
      const destCol = board?.columns.find((c) => c.id === toColumnId);
      toIndex = destCol ? destCol.tasks.length : 0;
    }

    if (moved.boardColumnId === toColumnId && moved.boardOrder === toIndex) {
      setDragging(false);
      return;
    }

    // moveTask handles optimistic update + clears the drag guard on settle.
    moveTask(activeId, toColumnId, toIndex);
  };

  // ── Column delete with last-column guard ───────────────────────────────────
  const handleDeleteColumn = async () => {
    if (!confirmDeleteCol) return;
    if (columns.length <= 1) {
      setDeleteColError(t('board.lastColumnError'));
      return;
    }
    try {
      await deleteColumn(confirmDeleteCol.id);
      setConfirmDeleteCol(null);
      setDeleteColError('');
    } catch {
      setDeleteColError(t('board.lastColumnError'));
    }
  };

  if (loading && !board) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!board) return null;

  const activeFilters = (filterAssignee ? 1 : 0) + (filterLabel ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap px-1 pb-4">
        {projectId && <MembersBar projectId={projectId} myRole={myRole} />}

        {/* Sprint scope selector */}
        <select
          value={sprintFilter}
          onChange={(e) => setSprintFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface border border-border text-sm text-fg outline-none focus:border-blue-500 transition-colors"
        >
          <option value="">{t('pm.allTasks')}</option>
          <option value="backlog">{t('pm.backlog')}</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.status === 'ACTIVE' ? ` · ${t('pm.statusActive')}` : ''}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('board.searchBoard')}
            className="pl-9 pr-3 py-2 rounded-xl bg-surface border border-border text-sm text-fg outline-none focus:border-blue-500 transition-colors w-44"
          />
        </div>

        {/* Filter */}
        <div className="relative">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-sm transition-colors flex items-center gap-1.5 ${
              activeFilters > 0
                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                : 'bg-surface border-border text-fg hover:bg-elevated'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 14.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-6.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {t('board.filter')}
            {activeFilters > 0 && <span className="text-xs">({activeFilters})</span>}
          </button>
          {filterOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
              <div className="absolute right-0 mt-1 z-20 w-60 rounded-xl bg-surface border border-border shadow-xl p-3 flex flex-col gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">{t('board.assignee')}</p>
                  <select
                    value={filterAssignee || ''}
                    onChange={(e) => setFilterAssignee(e.target.value || null)}
                    className="w-full px-2 py-1.5 rounded-lg bg-bg border border-border text-fg text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">{t('board.unassigned')} / —</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.fullName || m.username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">{t('board.labels')}</p>
                  <select
                    value={filterLabel || ''}
                    onChange={(e) => setFilterLabel(e.target.value || null)}
                    className="w-full px-2 py-1.5 rounded-lg bg-bg border border-border text-fg text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">—</option>
                    {board.labels.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                {activeFilters > 0 && (
                  <button
                    onClick={() => { setFilterAssignee(null); setFilterLabel(null); }}
                    className="text-xs text-blue-400 hover:text-blue-300 text-left"
                  >
                    {t('common.cancel')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Guide / tour */}
        <button
          onClick={() => setTourOpen(true)}
          title={t('board.guide')}
          aria-label={t('board.guide')}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface border border-border text-muted hover:text-fg hover:bg-elevated transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveTask(null); setDragging(false); }}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 px-1 flex-1 items-start">
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={filterTasks([...col.tasks].sort((a, b) => a.boardOrder - b.boardOrder))}
              canManage={canManage}
              myUserId={myUserId}
              canApprove={canApprove}
              onAddCard={(cid) => setAddCardColumn(cid)}
              onEditColumn={(c) => setEditColumn(c)}
              onDeleteColumn={(c) => { setConfirmDeleteCol(c); setDeleteColError(''); }}
              onCardClick={(tk) => setDetailTaskId(tk.id)}
              onWorkflowAction={handleWorkflowAction}
            />
          ))}

          {/* Add column */}
          {canManage && (
            <button
              onClick={() => setShowColumnModal(true)}
              className="w-72 flex-shrink-0 mt-1 h-11 rounded-xl border border-dashed border-border text-sm text-muted hover:text-fg hover:border-blue-500/40 transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('board.addColumn')}
            </button>
          )}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="w-72">
              <BoardCardBody task={activeTask} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modals */}
      {showColumnModal && (
        <ColumnModal onClose={() => setShowColumnModal(false)} onCreate={createColumn} />
      )}
      {editColumn && (
        <ColumnModal
          column={editColumn}
          onClose={() => setEditColumn(null)}
          onUpdate={updateColumn}
        />
      )}

      {addCardColumn && (
        <BoardTaskModal
          columnId={addCardColumn}
          members={members}
          labels={board.labels}
          onClose={() => setAddCardColumn(null)}
          onCreate={createTask}
          onCreateLabel={createLabel}
        />
      )}
      {editTask && (
        <BoardTaskModal
          task={editTask}
          members={members}
          labels={board.labels}
          onClose={() => setEditTask(null)}
          onUpdate={updateTask}
          onAssign={assignTask}
          onDelete={deleteTask}
          onCreateLabel={createLabel}
        />
      )}

      {planTask && (
        <PlanTaskModal
          taskTitle={planTask.title}
          taskKey={planTask.taskKey}
          initialEstimateMinutes={planTask.estimateMinutes}
          initialDayOfWeek={planTask.dayOfWeek}
          onClose={() => setPlanTask(null)}
          onSubmit={handlePlanSubmit}
        />
      )}

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          columnType={detailColumn?.columnType ?? null}
          columnName={detailColumn?.name ?? ''}
          members={members}
          myUserId={myUserId}
          canApprove={canApprove}
          onClose={() => setDetailTaskId(null)}
          onEdit={(tk) => { setDetailTaskId(null); setEditTask(tk); }}
          onWorkflowAction={handleWorkflowAction}
          onAssign={assignTask}
        />
      )}

      <BoardTour open={tourOpen} canApprove={canApprove} onClose={() => setTourOpen(false)} />

      {/* Delete column confirm */}
      {confirmDeleteCol && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDeleteCol(null)}>
          <div className="bg-elevated rounded-2xl p-6 w-full max-w-sm border border-border" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2 text-fg">{t('board.deleteColumn')}</h3>
            <p className="text-sm text-muted mb-4">{t('board.deleteColumnConfirm')}</p>
            {deleteColError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
                {deleteColError}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteCol(null)} className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={handleDeleteColumn} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors">
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
