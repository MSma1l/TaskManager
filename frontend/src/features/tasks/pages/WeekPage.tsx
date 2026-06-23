import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useWeek } from '../hooks/useWeek';
import { useTasks } from '../hooks/useTasks';
import { Task, CreateTaskData } from '../api/tasks';
import WeekGrid, { StatusLane } from '../components/WeekGrid';
import MobileDayView from '../components/MobileDayView';
import AddTaskModal from '../components/AddTaskModal';
import MarkTaskModal from '../components/MarkTaskModal';
import EditTaskModal from '../components/EditTaskModal';
import AssignedBoard from '../components/AssignedBoard';
import { formatWeekRange } from '../../../shared/utils/dates';

type HomeTab = 'personal' | 'assigned';

export default function WeekPage() {
  const t = useT();
  const { weekDays, weekStartISO, goNext, goPrev, goToday, offset } = useWeek();
  const { tasks, loading, refetch, createTask, updateTask, deleteTask, rescheduleTask, startTask, completeTask } =
    useTasks(weekStartISO);
  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState<Date | undefined>();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | 'none'>('none');
  // Deschide direct tab-ul "Repartizate" când vii dintr-o notificare (/?tab=assigned).
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<HomeTab>(
    searchParams.get('tab') === 'assigned' ? 'assigned' : 'personal',
  );

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

  const handleSetStatus = (task: Task, lane: StatusLane) => {
    if (lane === 'done') {
      completeTask(task.id, undefined, weekStartISO);
    } else if (lane === 'inProgress') {
      // Pastreaza nota existenta daca era deja in lucru; altfel foloseste un marcaj implicit.
      const note = task.completions?.[0]?.note || t('weekly.inProgressNote');
      startTask(task.id, note, weekStartISO);
    } else {
      // 'todo' → reset la „De facut" (nota goala).
      startTask(task.id, '', weekStartISO);
    }
  };

  return (
    <div className="px-3 sm:px-4 pt-3 sm:pt-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Saptamana</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{weekLabel}</p>
        </div>
        {tab === 'personal' && (
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
        )}
      </div>

      {/* Personal | Assigned toggle */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setTab('personal')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'personal' ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('board.personal')}
        </button>
        <button
          onClick={() => setTab('assigned')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'assigned' ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('board.assignedToMe')}
        </button>
      </div>

      {tab === 'assigned' ? (
        <AssignedBoard />
      ) : (
      <>
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
            onTakeInWork={(task) => handleSetStatus(task, 'inProgress')}
            onComplete={(task) => handleSetStatus(task, 'done')}
          />
          {/* Desktop grid */}
          <div className="hidden md:block">
            <WeekGrid
              weekDays={weekDays}
              tasks={tasks}
              direction={slideDir}
              onTaskClick={setSelectedTask}
              onAddClick={(date) => handleAddClick(date)}
              onReschedule={rescheduleTask}
              onSetStatus={handleSetStatus}
            />
          </div>
        </>
      )}
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
          weekStart={weekStartISO}
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
