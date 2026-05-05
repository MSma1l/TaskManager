import { useState } from 'react';
import { useWeek } from '../hooks/useWeek';
import { useTasks } from '../hooks/useTasks';
import { Task, CreateTaskData } from '../api/tasks';
import WeekGrid from '../components/WeekGrid';
import MobileDayView from '../components/MobileDayView';
import AddTaskModal from '../components/AddTaskModal';
import MarkTaskModal from '../components/MarkTaskModal';
import EditTaskModal from '../components/EditTaskModal';
import { formatWeekRange } from '../../../shared/utils/dates';

export default function WeekPage() {
  const { weekDays, weekStartISO, goNext, goPrev, goToday, offset } = useWeek();
  const { tasks, loading, refetch, createTask, updateTask, deleteTask } = useTasks(weekStartISO);
  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState<Date | undefined>();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | 'none'>('none');

  const weekLabel = formatWeekRange(weekDays[0], weekDays[6]);

  const handlePrev = () => {
    setSlideDir('left');
    goPrev();
  };

  const handleNext = () => {
    setSlideDir('right');
    goNext();
  };

  const handleToday = () => {
    if (offset === 0) return;
    setSlideDir(offset > 0 ? 'left' : 'right');
    goToday();
  };

  const handleAddClick = (date?: Date) => {
    setAddDate(date);
    setShowAdd(true);
  };

  const handleAddSubmit = async (data: CreateTaskData & { isRecurring: boolean }) => {
    await createTask(data);
  };

  const handleMarkDone = () => {
    setSelectedTask(null);
    refetch();
  };

  const handleEdit = (task: Task) => {
    setSelectedTask(null);
    setEditTask(task);
  };

  const handleEditSave = async (taskId: string, data: Partial<CreateTaskData>) => {
    await updateTask(taskId, data);
  };

  return (
    <div className="px-3 sm:px-4 pt-3 sm:pt-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Saptamana</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={handleToday}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
              offset === 0
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 cursor-default'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30'
            }`}
          >
            Azi
          </button>
          <button
            onClick={() => handleAddClick()}
            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-green-600 hover:bg-green-500 text-xs sm:text-sm font-semibold transition-all duration-200 shadow-lg shadow-green-600/20"
          >
            + Task
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <button
          onClick={handlePrev}
          className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/50 transition-all duration-200 hover:scale-105 active:scale-95"
          aria-label="Saptamana precedenta"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="text-center">
          <span className="text-xs sm:text-sm font-medium text-slate-300">{weekLabel}</span>
          {offset !== 0 && (
            <span className="ml-2 text-[10px] sm:text-xs text-slate-500">
              ({offset > 0 ? '+' : ''}{offset} sapt.)
            </span>
          )}
        </div>

        <button
          onClick={handleNext}
          className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/50 transition-all duration-200 hover:scale-105 active:scale-95"
          aria-label="Saptamana urmatoare"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Mobile single-day view */}
          <MobileDayView
            weekDays={weekDays}
            tasks={tasks}
            onTaskClick={setSelectedTask}
            onAddClick={(date) => handleAddClick(date)}
            onPrevWeek={handlePrev}
            onNextWeek={handleNext}
          />
          {/* Desktop grid */}
          <div className="hidden md:block">
            <WeekGrid
              weekDays={weekDays}
              tasks={tasks}
              direction={slideDir}
              onTaskClick={setSelectedTask}
              onAddClick={(date) => handleAddClick(date)}
            />
          </div>
        </>
      )}

      {/* Modals */}
      {showAdd && (
        <AddTaskModal
          defaultDate={addDate}
          onClose={() => setShowAdd(false)}
          onSubmit={handleAddSubmit}
        />
      )}

      {selectedTask && (
        <MarkTaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onDone={handleMarkDone}
          onDelete={deleteTask}
          onEdit={handleEdit}
        />
      )}

      {editTask && (
        <EditTaskModal
          task={editTask}
          onClose={() => { setEditTask(null); refetch(); }}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}
