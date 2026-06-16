import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useSprintPlanning } from '../hooks/useSprintPlanning';
import { useMembers } from '../hooks/useMembers';
import { boardApi, BoardTask, BoardColumn, CreateBoardTaskData } from '../api/board';
import { Sprint } from '../api/sprints';
import { ProjectRole } from '../api/members';
import { BoardCardBody } from './BoardCard';
import AiTaskWizard from './AiTaskWizard';
import SprintPlannerModal from './SprintPlannerModal';
import ManualBacklogTaskModal from './ManualBacklogTaskModal';

interface SprintPlanningBoardProps {
  projectId: string;
  myRole?: ProjectRole;
}

const BACKLOG_ZONE = 'backlog';

export default function SprintPlanningBoard({ projectId, myRole }: SprintPlanningBoardProps) {
  const t = useT();
  const {
    backlog,
    sprints,
    loading,
    warning,
    clearWarning,
    setDragging,
    findTask,
    refetch,
    moveToSprint,
    moveToBacklog,
    moveBetweenSprints,
  } = useSprintPlanning(projectId);
  const { members } = useMembers(projectId);

  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';

  // Doar sprinturile care nu sunt finalizate sunt zone de planificare.
  const planningSprints = useMemo(
    () => sprints.filter((s) => s.status !== 'COMPLETED'),
    [sprints],
  );

  // ── modale de adaugare (din BacklogPanel) ──────────────────────────
  const [showAi, setShowAi] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [backlogColumn, setBacklogColumn] = useState<BoardColumn | null>(null);

  const loadBacklogColumn = useCallback(async () => {
    if (!projectId) return;
    try {
      const board = await boardApi.getBoard(projectId);
      const col =
        board.columns.find((c) => c.columnType === 'BACKLOG') ??
        [...board.columns].sort((a, b) => a.position - b.position)[0] ??
        null;
      setBacklogColumn(col);
    } catch {
      // ignore — butonul manual ramane dezactivat pana se rezolva
    }
  }, [projectId]);

  useEffect(() => { loadBacklogColumn(); }, [loadBacklogColumn]);

  const handleManualCreate = async (data: CreateBoardTaskData) => {
    await boardApi.createTask(projectId, data);
    await refetch();
  };

  // Auto-ascunde toastul de capacitate.
  useEffect(() => {
    if (!warning) return;
    const id = setTimeout(clearWarning, 5000);
    return () => clearTimeout(id);
  }, [warning, clearWarning]);

  // ── drag ───────────────────────────────────────────────────────────
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setDragging(true);
    const tk = findTask(String(e.active.id));
    if (tk) setActiveTask(tk);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) { setDragging(false); return; }

    const taskId = String(active.id);
    const moved = findTask(taskId);
    if (!moved) { setDragging(false); return; }

    // Determina zona tinta: cardul peste care s-a lasat sau containerul zonei.
    const overId = String(over.id);
    const overTask = findTask(overId);
    const targetZone = overTask
      ? (overTask.sprintId ?? BACKLOG_ZONE)
      : overId;

    const fromZone = moved.sprintId ?? BACKLOG_ZONE;
    if (fromZone === targetZone) { setDragging(false); return; }

    if (targetZone === BACKLOG_ZONE) {
      if (moved.sprintId) moveToBacklog(taskId, moved.sprintId);
      else setDragging(false);
    } else if (moved.sprintId) {
      moveBetweenSprints(taskId, moved.sprintId, targetZone);
    } else {
      moveToSprint(taskId, targetZone);
    }
  };

  if (loading && backlog.length === 0 && sprints.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <h2 className="text-lg font-bold text-fg">{t('pm.backlog')}</h2>
        <span className="text-xs text-muted">
          {backlog.length} {t('pm.tasks')}
        </span>
        <div className="flex-1" />
        {canManage && (
          <>
            <button
              onClick={() => setShowManual(true)}
              disabled={!backlogColumn}
              className="px-3 py-2 rounded-xl bg-surface hover:bg-elevated border border-border text-sm text-fg transition-colors disabled:opacity-50"
            >
              + {t('pm.task')}
            </button>
            <button
              onClick={() => setShowAi(true)}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-violet-600/20 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              {t('pm.aiTask')}
            </button>
            <button
              onClick={() => setShowPlanner(true)}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-violet-600/20 flex items-center gap-1.5"
            >
              <span aria-hidden>✨</span>
              {t('pm.planSprint')}
            </button>
          </>
        )}
      </div>

      {/* Hint planificare */}
      {canManage && (
        <p className="text-xs text-muted mb-4">{t('sprintPlan.dragHint')}</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveTask(null); setDragging(false); }}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {/* Backlog */}
          <PlanningZone
            id={BACKLOG_ZONE}
            title={t('sprintPlan.backlogZone')}
            subtitle={`${backlog.length} ${t('pm.tasks')}`}
            tasks={backlog}
            canManage={canManage}
            emptyLabel={t('pm.backlogEmpty')}
          />

          {/* Sprinturi (ne-finalizate) */}
          {planningSprints.map((s) => (
            <SprintZone key={s.id} sprint={s} canManage={canManage} t={t} />
          ))}

          {planningSprints.length === 0 && (
            <div className="w-72 flex-shrink-0 rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
              {t('sprintPlan.noSprints')}
            </div>
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

      {/* Toast capacitate */}
      {warning && warning.overCapacity && (
        <div className="fixed bottom-6 right-6 z-50 max-w-xs rounded-xl bg-orange-600/95 text-white px-4 py-3 shadow-xl border border-orange-400/40">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z" />
            </svg>
            <div className="text-sm">
              <p className="font-semibold">{t('sprintPlan.overCapacity')}</p>
              <p className="text-white/90">
                {warning.assigneePoints} / {warning.capacityPoints} {t('pm.points')}
              </p>
            </div>
            <button onClick={clearWarning} className="ml-1 text-white/70 hover:text-white" aria-label={t('common.cancel')}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Modale */}
      {showAi && (
        <AiTaskWizard
          projectId={projectId}
          members={members}
          onClose={() => setShowAi(false)}
          onCreated={refetch}
        />
      )}
      {showPlanner && (
        <SprintPlannerModal
          projectId={projectId}
          onClose={() => setShowPlanner(false)}
          onCreated={refetch}
        />
      )}
      {showManual && backlogColumn && (
        <ManualBacklogTaskModal
          columnId={backlogColumn.id}
          members={members}
          onClose={() => setShowManual(false)}
          onCreate={handleManualCreate}
        />
      )}
    </div>
  );
}

// ── zone ───────────────────────────────────────────────────────────────────

function SprintZone({
  sprint,
  canManage,
  t,
}: {
  sprint: Sprint;
  canManage: boolean;
  t: (k: string) => string;
}) {
  const statusBadge =
    sprint.status === 'ACTIVE'
      ? `${t('pm.statusActive')}`
      : t('pm.statusPlanned');
  const points = sprint.tasks.reduce((sum, tk) => sum + (tk.storyPoints || 0), 0);
  return (
    <PlanningZone
      id={sprint.id}
      title={sprint.name}
      subtitle={`${sprint.tasks.length} ${t('pm.tasks')} · ${points} ${t('pm.points')} · ${statusBadge}`}
      tasks={sprint.tasks}
      canManage={canManage}
      emptyLabel={t('sprintPlan.dropHere')}
    />
  );
}

function PlanningZone({
  id,
  title,
  subtitle,
  tasks,
  canManage,
  emptyLabel,
}: {
  id: string;
  title: string;
  subtitle: string;
  tasks: BoardTask[];
  canManage: boolean;
  emptyLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 flex-shrink-0 rounded-2xl bg-bg/40 border p-2.5 transition-colors ${
        isOver ? 'border-blue-500/60 bg-blue-500/5' : 'border-border'
      }`}
    >
      <div className="px-1.5 pb-2">
        <p className="text-sm font-bold text-fg truncate">{title}</p>
        <p className="text-[11px] text-muted">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-2 min-h-[60px]">
        {tasks.length === 0 ? (
          <div className="text-center text-[11px] text-muted py-6 rounded-xl border border-dashed border-border">
            {emptyLabel}
          </div>
        ) : (
          tasks.map((task) =>
            canManage ? (
              <DraggablePlanningCard key={task.id} task={task} />
            ) : (
              <BoardCardBody key={task.id} task={task} />
            ),
          )
        )}
      </div>
    </div>
  );
}

function DraggablePlanningCard({ task }: { task: BoardTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'task', task },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="cursor-grab active:cursor-grabbing touch-none"
    >
      <BoardCardBody task={task} />
    </div>
  );
}
