import { useDroppable } from '@dnd-kit/core';
import { Task } from '../api/tasks';
import { DAYS_RO } from '../../../shared/utils/constants';
import { formatDateNice, isToday, getDayOfWeek } from '../../../shared/utils/dates';
import DraggableTaskCard from './DraggableTaskCard';

interface DayColumnProps {
  date: Date;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddClick: (date: Date) => void;
  onTakeInWork?: (task: Task) => void;
  onComplete?: (task: Task) => void;
  index: number;
}

export default function DayColumn({ date, tasks, onTaskClick, onAddClick, onTakeInWork, onComplete, index }: DayColumnProps) {
  const dayOfWeek = getDayOfWeek(date);
  const today = isToday(date);
  const dayTasks = tasks.filter((t) => t.dayOfWeek === dayOfWeek);
  const doneCount = dayTasks.filter(
    (t) => t.completions?.[0]?.status === 'DONE'
  ).length;

  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayOfWeek}`, data: { type: 'day', dayOfWeek } });

  return (
    <div
      ref={setNodeRef}
      className={`fade-in-up flex-shrink-0 w-48 sm:w-auto sm:flex-1 rounded-2xl p-4 transition-all duration-300 ${
        today
          ? 'bg-gradient-to-b from-blue-600/20 to-slate-800 border-2 border-blue-500/60 shadow-lg shadow-blue-500/10'
          : 'bg-slate-800/60 border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-800/80'
      } ${isOver ? 'ring-2 ring-blue-400/70 bg-slate-800/90' : ''}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {today && (
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          )}
          <div>
            <div className={`text-sm font-bold tracking-wide ${today ? 'text-blue-300' : 'text-slate-200'}`}>
              {DAYS_RO[dayOfWeek - 1]}
            </div>
            <div className={`text-xs mt-0.5 ${today ? 'text-blue-400/80' : 'text-slate-500'}`}>
              {formatDateNice(date)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dayTasks.length > 0 && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              doneCount === dayTasks.length && dayTasks.length > 0
                ? 'bg-green-500/20 text-green-400'
                : 'bg-slate-700/60 text-slate-400'
            }`}>
              {doneCount}/{dayTasks.length}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onAddClick(date); }}
            className="w-7 h-7 rounded-full bg-slate-700/80 hover:bg-blue-600 flex items-center justify-center text-sm font-light transition-all duration-200 hover:scale-110"
          >
            +
          </button>
        </div>
      </div>

      {/* Tasks */}
      <div className="flex flex-col gap-2 flex-1">
        {dayTasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            onClick={onTaskClick}
            onTakeInWork={onTakeInWork}
            onComplete={onComplete}
          />
        ))}
        {dayTasks.length === 0 && (
          <div className="py-6 flex items-center justify-center">
            <p className="text-xs text-slate-600 italic">Fara taskuri</p>
          </div>
        )}
      </div>
    </div>
  );
}
