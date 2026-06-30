import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useBoard } from '../hooks/useBoard';
import { BoardTask } from '../api/board';
import { ProjectZone } from '../api/projects';
import { ZONE_META, ZONE_ORDER, deadlinePillText, formatDuration } from './zoneMeta';
import { AssigneeStack } from './BoardCard';

interface TaskZonesPanelProps {
  projectId: string;
  /** Deschide board-ul (cardurile din zone trimit acolo). */
  onOpenBoard?: () => void;
}

type Translate = (key: string) => string;

const isZoneId = (id: string): id is ProjectZone => (ZONE_ORDER as string[]).includes(id);

/** Stable sort by `zoneOrder` (nulls last, original order preserved for ties). */
function sortByZoneOrder<T extends { zoneOrder: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.zoneOrder == null && b.zoneOrder == null) return 0;
    if (a.zoneOrder == null) return 1;
    if (b.zoneOrder == null) return -1;
    return a.zoneOrder - b.zoneOrder;
  });
}

/** Presentational task card — shared by the sortable card and the drag overlay. */
function TaskCardBody({
  task,
  t,
  onUnpin,
}: {
  task: BoardTask;
  t: Translate;
  onUnpin: (id: string) => void;
}) {
  const zoneMeta = ZONE_META[task.zone] ?? ZONE_META.BACKLOG;
  const hasTime = task.timeSpentSeconds > 0 || task.runningTimers.length > 0;
  return (
    <div
      className={`min-w-[240px] max-w-[260px] p-3.5 rounded-2xl bg-surface ${zoneMeta.cardBg} border border-border ${zoneMeta.cardHover} hover:bg-elevated transition-all duration-200`}
    >
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        {task.taskKey && (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400">
            {task.taskKey}
          </span>
        )}
        {task.dueDate && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${zoneMeta.pill}`}>
            {deadlinePillText(t, task.daysRemaining, task.dueDate)}
          </span>
        )}
        {task.pinnedZone && (
          <button
            type="button"
            title={t('projectZone.pinnedTooltip')}
            aria-label={t('projectZone.pinnedAria')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onUnpin(task.id);
            }}
            className="ml-auto text-xs leading-none hover:scale-110 transition-transform"
          >
            📌
          </button>
        )}
      </div>

      <p className="text-sm font-medium text-fg leading-snug break-words line-clamp-2">{task.title}</p>

      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted min-w-0">
          {hasTime && (
            <span className="flex items-center gap-1">
              {task.runningTimers.length > 0 && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                </span>
              )}
              {formatDuration(task.timeSpentSeconds)}
            </span>
          )}
        </div>
        <AssigneeStack assignees={task.assignees} />
      </div>
    </div>
  );
}

/** Sortable wrapper: drag listeners + click-to-open (drag suppressed past the activation distance). */
function SortableTaskCard({
  task,
  t,
  onOpen,
  onUnpin,
}: {
  task: BoardTask;
  t: Translate;
  onOpen?: () => void;
  onUnpin: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', zone: task.zone },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.()}
      className="text-left shrink-0 snap-start cursor-grab active:cursor-grabbing touch-none"
    >
      <TaskCardBody task={task} t={t} onUnpin={onUnpin} />
    </div>
  );
}

/** Droppable zone row; stays a valid drop target even when empty. */
function TaskZoneRow({
  zone,
  items,
  t,
  onOpen,
  onUnpin,
}: {
  zone: ProjectZone;
  items: BoardTask[];
  t: Translate;
  onOpen?: () => void;
  onUnpin: (id: string) => void;
}) {
  const zoneMeta = ZONE_META[zone];
  const { setNodeRef, isOver } = useDroppable({ id: zone, data: { type: 'zone', zone } });

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-1.5 h-10 rounded-full ${zoneMeta.accent}`} />
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${zoneMeta.badge}`}>
          {zoneMeta.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={`text-base font-bold ${zoneMeta.headerText}`}>{t(zoneMeta.labelKey)}</h2>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${zoneMeta.badge}`}>{items.length}</span>
          </div>
          <p className="text-xs text-muted">{t(zoneMeta.subtitleKey)}</p>
        </div>
      </div>

      <SortableContext items={items.map((tk) => tk.id)} strategy={horizontalListSortingStrategy}>
        {items.length === 0 ? (
          <div
            ref={setNodeRef}
            className={`rounded-2xl border border-dashed px-5 py-6 text-sm text-muted transition-colors ${
              isOver ? 'border-blue-500/50 bg-blue-500/5' : 'border-border'
            }`}
          >
            {t('projectZone.empty')}
          </div>
        ) : (
          <div
            ref={setNodeRef}
            className={`flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x scroll-pl-1 rounded-2xl [scrollbar-width:thin] transition-colors ${
              isOver ? 'bg-blue-500/5' : ''
            }`}
          >
            {items.map((task) => (
              <SortableTaskCard key={task.id} task={task} t={t} onOpen={onOpen} onUnpin={onUnpin} />
            ))}
          </div>
        )}
      </SortableContext>
    </section>
  );
}

/**
 * Board tasks grouped by their priority zone, with drag & drop between zones.
 * Mirrors the project-level zones layout: 4 sections (URGENT→BACKLOG), each a
 * horizontally-scrolling row of compact task cards.
 */
export default function TaskZonesPanel({ projectId, onOpenBoard }: TaskZonesPanelProps) {
  const t = useT();
  const { board, loading, setBoard, updateTask, reorderZone } = useBoard(projectId);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const tasks = useMemo<BoardTask[]>(
    () => (board ? board.columns.flatMap((c) => c.tasks) : []),
    [board],
  );

  // Tasks grouped by displayed zone, each pre-sorted by zoneOrder.
  const zoneItems = useMemo(() => {
    const map: Record<ProjectZone, BoardTask[]> = { URGENT: [], MEDIUM: [], NORMAL: [], BACKLOG: [] };
    for (const tk of tasks) (map[tk.zone] ?? map.BACKLOG).push(tk);
    for (const z of ZONE_ORDER) map[z] = sortByZoneOrder(map[z]);
    return map;
  }, [tasks]);

  const activeTask = activeId ? tasks.find((tk) => tk.id === activeId) ?? null : null;

  if (loading && !board) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const movedId = String(active.id);
    const overId = String(over.id);
    if (movedId === overId) return;

    const moved = tasks.find((tk) => tk.id === movedId);
    if (!moved) return;
    const sourceZone = moved.zone;
    const targetZone: ProjectZone = isZoneId(overId)
      ? overId
      : tasks.find((tk) => tk.id === overId)?.zone ?? sourceZone;

    const destIds = zoneItems[targetZone].map((tk) => tk.id).filter((id) => id !== movedId);
    let insertAt = isZoneId(overId) ? destIds.length : destIds.indexOf(overId);
    if (insertAt < 0) insertAt = destIds.length;
    const orderedIds = [...destIds];
    orderedIds.splice(insertAt, 0, movedId);

    const repin = sourceZone !== targetZone;

    // Optimistic local update across all columns; the hook refetches to settle.
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((c) => ({
              ...c,
              tasks: c.tasks.map((tk) => {
                if (tk.id === movedId)
                  return {
                    ...tk,
                    zone: targetZone,
                    pinnedZone: repin ? targetZone : tk.pinnedZone,
                    zoneOrder: orderedIds.indexOf(tk.id),
                  };
                if (orderedIds.includes(tk.id)) return { ...tk, zoneOrder: orderedIds.indexOf(tk.id) };
                return tk;
              }),
            })),
          }
        : prev,
    );

    reorderZone({ movedId, targetZone, orderedIds, repin });
  };

  const handleUnpin = (id: string) => updateTask(id, { pinnedZone: null });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col gap-7">
        {ZONE_ORDER.map((zone) => (
          <TaskZoneRow
            key={zone}
            zone={zone}
            items={zoneItems[zone]}
            t={t}
            onOpen={onOpenBoard}
            onUnpin={handleUnpin}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-1">
            <TaskCardBody task={activeTask} t={t} onUnpin={handleUnpin} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
