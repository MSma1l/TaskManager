import { useMemo, useState } from 'react';
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
import { useOfficeBoard } from '../hooks/useOfficeBoard';
import { BoardColumn as Column, BoardTask } from '../../projects/api/board';
import BoardColumn from '../../projects/components/BoardColumn';
import { BoardCardBody, AssigneeStack } from '../../projects/components/BoardCard';
import TaskDetailDrawer from '../../projects/components/TaskDetailDrawer';
import AssigneePicker from '../../projects/components/AssigneePicker';

/**
 * Board-ul de birou afișat pe pagina „Astăzi".
 *
 * Mutarea între coloane se face prin drag&drop, reutilizând `BoardColumn` /
 * `BoardCard` (deja sortabile) și endpoint-ul de move al board-ului de proiect,
 * apelat cu `projectId`-ul de birou. Click pe card deschide `TaskDetailDrawer`
 * (comentarii + checklist), iar inbox-ul (doar admin) permite repartizarea.
 */
export default function OfficeBoard() {
  const t = useT();
  const {
    data,
    members,
    projectId,
    loading,
    setDragging,
    moveTask,
    assignTask,
    addSubtask,
    updateSubtask,
    removeSubtask,
    updateTask,
  } = useOfficeBoard();

  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [assigningInboxId, setAssigningInboxId] = useState<string | null>(null);

  const myUserId = useMemo(() => members.find((m) => m.isYou)?.userId ?? null, [members]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Construim coloane în forma așteptată de `BoardColumn`, grupând task-urile.
  // `columnType: null` ⇒ nu apar butoane de workflow pe card (mutarea = DnD).
  const columns: Column[] = useMemo(() => {
    if (!data) return [];
    return [...data.columns]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position,
        color: null,
        isDoneColumn: c.isDoneColumn,
        columnType: null,
        tasks: data.tasks
          .filter((tk) => tk.boardColumnId === c.id)
          .sort((a, b) => a.boardOrder - b.boardOrder),
      }));
  }, [data]);

  const findTask = (id: string): BoardTask | undefined =>
    data?.tasks.find((tk) => tk.id === id);

  const detailTask = useMemo(
    () => (detailTaskId ? data?.tasks.find((tk) => tk.id === detailTaskId) ?? null : null),
    [detailTaskId, data],
  );
  const detailColumn = useMemo(
    () =>
      detailTask ? columns.find((c) => c.id === detailTask.boardColumnId) ?? null : null,
    [detailTask, columns],
  );

  const handleDragStart = (e: DragStartEvent) => {
    setDragging(true);
    const tk = findTask(String(e.active.id));
    if (tk) setActiveTask(tk);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) {
      setDragging(false);
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    const moved = findTask(activeId);
    if (!moved) {
      setDragging(false);
      return;
    }

    let toColumnId: string;
    let toIndex: number;
    const overTask = findTask(overId);
    if (overTask) {
      toColumnId = overTask.boardColumnId;
      const dest = columns.find((c) => c.id === toColumnId);
      const ordered = dest ? dest.tasks : [];
      toIndex = ordered.findIndex((tk) => tk.id === overId);
      if (toIndex === -1) toIndex = ordered.length;
    } else {
      toColumnId = overId;
      const dest = columns.find((c) => c.id === toColumnId);
      toIndex = dest ? dest.tasks.length : 0;
    }

    if (moved.boardColumnId === toColumnId && moved.boardOrder === toIndex) {
      setDragging(false);
      return;
    }
    moveTask(activeId, toColumnId, toIndex);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!data || columns.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-muted mb-2">
        {t('office.boardTitle')}
      </h2>

      {/* Inbox birou (doar admin) — task-uri fără responsabil. */}
      {data.isAdmin && data.inbox.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-400 mb-2">
            {t('office.inbox')}
          </p>
          <div className="flex flex-col gap-3">
            {data.inbox.map((tk) => (
              <div key={tk.id} className="rounded-xl bg-surface border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-fg leading-snug break-words flex-1">
                    {tk.title}
                  </p>
                  <AssigneeStack assignees={tk.assignees} />
                </div>
                {assigningInboxId === tk.id ? (
                  <div className="mt-2">
                    <p className="text-xs text-muted mb-1.5">{t('office.assignTo')}</p>
                    <AssigneePicker
                      members={members}
                      value={tk.assignees.map((a) => a.userId)}
                      onChange={async (ids) => {
                        await assignTask(tk.id, ids);
                        setAssigningInboxId(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAssigningInboxId(tk.id)}
                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition-colors"
                  >
                    {t('office.assignTo')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Board (coloane cu drag&drop) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveTask(null);
          setDragging(false);
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={col.tasks}
              canManage={false}
              myUserId={myUserId}
              canApprove={false}
              onAddCard={() => {}}
              onEditColumn={() => {}}
              onDeleteColumn={() => {}}
              onCardClick={(tk) => setDetailTaskId(tk.id)}
              onWorkflowAction={() => {}}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="w-72">
              <BoardCardBody task={activeTask} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          columnType={detailColumn?.columnType ?? null}
          columnName={detailColumn?.name ?? ''}
          members={members}
          myUserId={myUserId}
          canApprove={data.isAdmin}
          onClose={() => setDetailTaskId(null)}
          onEdit={() => setDetailTaskId(null)}
          onWorkflowAction={() => {}}
          onUpdate={(taskId, patch) =>
            updateTask(taskId, { storyPoints: patch.storyPoints })
          }
          onAssign={projectId ? assignTask : undefined}
          onAddSubtask={addSubtask}
          onToggleSubtask={(taskId, sid, done) => updateSubtask(taskId, sid, { done })}
          onRemoveSubtask={removeSubtask}
        />
      )}
    </section>
  );
}
