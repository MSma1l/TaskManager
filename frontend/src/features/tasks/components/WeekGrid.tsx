import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { Task } from '../api/tasks';
import { useT } from '../../../shared/i18n/I18nProvider';
import { formatISO } from '../../../shared/utils/dates';
import DayColumn from './DayColumn';
import TaskCard from './TaskCard';

export type StatusLane = 'todo' | 'inProgress' | 'done';

interface WeekGridProps {
  weekDays: Date[];
  tasks: Task[];
  direction: 'left' | 'right' | 'none';
  onTaskClick: (task: Task) => void;
  onAddClick: (date: Date) => void;
  /** Drag a card to another day → reschedule (dayOfWeek + scheduledDate for one-time tasks). */
  onReschedule: (taskId: string, dayOfWeek: number, scheduledDate?: string) => void;
  /** Drag a card onto a status zone, or use the quick buttons → change state. */
  onSetStatus: (task: Task, lane: StatusLane) => void;
}

function StatusZone({ lane, label, accent }: { lane: StatusLane; label: string; accent: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-${lane}`, data: { type: 'status', lane } });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-sm font-semibold transition-all duration-150 ${accent} ${
        isOver ? 'ring-2 ring-offset-0 scale-[1.02]' : 'opacity-80'
      }`}
    >
      {label}
    </div>
  );
}

export default function WeekGrid({
  weekDays,
  tasks,
  direction,
  onTaskClick,
  onAddClick,
  onReschedule,
  onSetStatus,
}: WeekGridProps) {
  const t = useT();
  const animClass = direction === 'right' ? 'slide-in-right' : direction === 'left' ? 'slide-in-left' : '';
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dragging, setDragging] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const findTask = (id: string) => tasks.find((tk) => tk.id === id);

  const handleDragStart = (e: DragStartEvent) => {
    const tk = findTask(String(e.active.id));
    if (tk) {
      setActiveTask(tk);
      setDragging(true);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveTask(null);
    setDragging(false);
    if (!over) return;

    const task = findTask(String(active.id));
    if (!task) return;
    const overId = String(over.id);

    if (overId.startsWith('day-')) {
      const dayOfWeek = Number(overId.slice(4));
      if (!Number.isNaN(dayOfWeek) && dayOfWeek !== task.dayOfWeek) {
        // For one-time tasks, also move the scheduled date to the target day of THIS week.
        const scheduledDate = task.isRecurring ? undefined : formatISO(weekDays[dayOfWeek - 1]);
        onReschedule(task.id, dayOfWeek, scheduledDate);
      }
      return;
    }

    if (overId.startsWith('status-')) {
      const lane = overId.slice(7) as StatusLane;
      onSetStatus(task, lane);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveTask(null); setDragging(false); }}
    >
      {/* Status drop bar — visible only while dragging, so it never gets in the way. */}
      <div
        className={`grid grid-cols-3 gap-3 mb-3 transition-all duration-200 ${
          dragging ? 'opacity-100 max-h-24' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none mb-0'
        }`}
      >
        <StatusZone lane="todo" label={t('weekly.todo')} accent="border-slate-500/50 text-slate-300 ring-slate-400/60" />
        <StatusZone lane="inProgress" label={t('weekly.inProgress')} accent="border-amber-500/50 text-amber-300 ring-amber-400/60" />
        <StatusZone lane="done" label={t('weekly.done')} accent="border-green-500/50 text-green-300 ring-green-400/60" />
      </div>

      <div
        key={weekDays[0].toISOString()}
        className={`flex gap-3 overflow-x-auto pb-4 sm:grid sm:grid-cols-7 sm:gap-3 sm:overflow-visible ${animClass}`}
      >
        {weekDays.map((date, i) => (
          <DayColumn
            key={date.toISOString()}
            date={date}
            tasks={tasks}
            onTaskClick={onTaskClick}
            onAddClick={onAddClick}
            onTakeInWork={(tk) => onSetStatus(tk, 'inProgress')}
            onComplete={(tk) => onSetStatus(tk, 'done')}
            index={i}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="w-48 rotate-1">
            <TaskCard task={activeTask} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
