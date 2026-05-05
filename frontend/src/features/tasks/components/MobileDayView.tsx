import { useEffect, useRef, useState } from 'react';
import { Task } from '../api/tasks';
import { DAYS_RO, DAYS_SHORT } from '../../../shared/utils/constants';
import { formatDateNice, isToday, isSameDay, getDayOfWeek } from '../../../shared/utils/dates';
import TaskCard from './TaskCard';

interface MobileDayViewProps {
  weekDays: Date[];
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddClick: (date: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

/**
 * Mobile single-day view of the week. Shows one day at a time with
 * prominent strip of pickers for the seven days, plus week-level
 * navigation arrows and swipe-to-change-day gestures.
 */
export default function MobileDayView({
  weekDays,
  tasks,
  onTaskClick,
  onAddClick,
  onPrevWeek,
  onNextWeek,
}: MobileDayViewProps) {
  const todayInWeek = weekDays.findIndex((d) => isToday(d));
  const initial = todayInWeek >= 0 ? todayInWeek : 0;
  const [selectedIdx, setSelectedIdx] = useState<number>(initial);

  // When switching weeks, snap to today if it's in the new week, else first day
  useEffect(() => {
    const idx = weekDays.findIndex((d) => isToday(d));
    setSelectedIdx(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDays[0].toISOString()]);

  const date = weekDays[selectedIdx];
  const dayOfWeek = getDayOfWeek(date);
  const dayTasks = tasks.filter((t) => t.dayOfWeek === dayOfWeek);
  const doneCount = dayTasks.filter((t) => t.completions?.[0]?.status === 'DONE').length;

  // Swipe handling
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const dt = Date.now() - start.t;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 600) {
      if (dx < 0) {
        // swipe left → next day
        if (selectedIdx < 6) setSelectedIdx(selectedIdx + 1);
        else onNextWeek();
      } else {
        if (selectedIdx > 0) setSelectedIdx(selectedIdx - 1);
        else onPrevWeek();
      }
    }
    touchStart.current = null;
  };

  return (
    <div className="md:hidden">
      {/* Day picker strip — scrollable horizontally on small phones */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {weekDays.map((d, i) => {
          const sel = i === selectedIdx;
          const today = isToday(d);
          const dayDoneCount = tasks.filter(
            (t) => t.dayOfWeek === getDayOfWeek(d) && t.completions?.[0]?.status === 'DONE',
          ).length;
          const dayTotal = tasks.filter((t) => t.dayOfWeek === getDayOfWeek(d)).length;
          const allDone = dayTotal > 0 && dayDoneCount === dayTotal;
          return (
            <button
              key={d.toISOString()}
              onClick={() => setSelectedIdx(i)}
              className={`relative flex flex-col items-center py-2 rounded-xl transition-all duration-150 ${
                sel
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : today
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/40'
                  : 'bg-slate-800/60 text-slate-300 border border-slate-700/50'
              }`}
            >
              <span className="text-[10px] uppercase tracking-wide opacity-75 leading-none">
                {DAYS_SHORT[i]}
              </span>
              <span className={`text-lg font-bold leading-tight mt-0.5 ${sel ? '' : today ? '' : ''}`}>
                {d.getDate()}
              </span>
              {dayTotal > 0 && (
                <span
                  className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${
                    allDone ? 'bg-green-400' : sel ? 'bg-white' : 'bg-slate-400'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Day pane (swipe enabled) */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="rounded-2xl bg-slate-800/70 border border-slate-700/50 p-4 min-h-[60vh] fade-in-up"
        key={date.toISOString()}
      >
        {/* Day header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isToday(date) && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
            <div>
              <div className={`text-base font-bold ${isToday(date) ? 'text-blue-300' : 'text-slate-100'}`}>
                {DAYS_RO[dayOfWeek - 1]}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{formatDateNice(date)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dayTasks.length > 0 && (
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                doneCount === dayTasks.length ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/60 text-slate-300'
              }`}>
                {doneCount}/{dayTasks.length}
              </span>
            )}
            <button
              onClick={() => onAddClick(date)}
              className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xl font-light"
              aria-label="Adauga task"
            >
              +
            </button>
          </div>
        </div>

        {/* Tasks */}
        <div className="flex flex-col gap-2">
          {dayTasks.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <p className="text-slate-500 text-sm italic">Nicio sarcina astazi</p>
              <button
                onClick={() => onAddClick(date)}
                className="mt-3 text-xs text-blue-400 hover:text-blue-300"
              >
                + Adauga prima sarcina
              </button>
            </div>
          )}
          {dayTasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={onTaskClick} />
          ))}
        </div>
      </div>

      {/* Day-level prev/next */}
      <div className="flex justify-between items-center mt-3 px-1">
        <button
          onClick={() => {
            if (selectedIdx > 0) setSelectedIdx(selectedIdx - 1);
            else onPrevWeek();
          }}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm border border-slate-700/50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {selectedIdx > 0 ? DAYS_RO[getDayOfWeek(weekDays[selectedIdx - 1]) - 1] : 'Sapt. precedenta'}
        </button>
        <button
          onClick={() => {
            if (selectedIdx < 6) setSelectedIdx(selectedIdx + 1);
            else onNextWeek();
          }}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm border border-slate-700/50"
        >
          {selectedIdx < 6 ? DAYS_RO[getDayOfWeek(weekDays[selectedIdx + 1]) - 1] : 'Sapt. urmatoare'}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// helper kept to ensure isSameDay export usage doesn't break tree-shaking
void isSameDay;
