import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useAssignedTasks } from '../hooks/useAssignedTasks';
import { AssignedTask } from '../api/assigned';
import { TransitionData } from '../../projects/api/board';
import { columnTypeKey } from '../../projects/components/boardConstants';
import PlanTaskModal from '../../projects/components/PlanTaskModal';

const DOW_KEYS = [
  'board.dowMon',
  'board.dowTue',
  'board.dowWed',
  'board.dowThu',
  'board.dowFri',
  'board.dowSat',
  'board.dowSun',
];

function formatEstimate(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Un task asignat e "Nou / Trebuie început" cât timp nu a fost luat în lucru
 *  (e încă în Backlog / Planificate). */
function isNewAssigned(task: AssignedTask): boolean {
  return task.columnType === 'BACKLOG' || task.columnType === 'PLANNED';
}

export default function AssignedTasksList() {
  const t = useT();
  const navigate = useNavigate();
  const { tasks, loading, planTask } = useAssignedTasks();
  const [planning, setPlanning] = useState<AssignedTask | null>(null);

  const handlePlanSubmit = async (data: TransitionData) => {
    if (!planning) return;
    await planTask(planning.project.id, planning.id, data);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted">{t('board.noAssigned')}</p>
      </div>
    );
  }

  // Task-urile noi (ne-începute) le aducem primele, ca să sară în ochi.
  const ordered = [...tasks].sort(
    (a, b) => Number(isNewAssigned(b)) - Number(isNewAssigned(a)),
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((task) => {
          const isNew = isNewAssigned(task);
          return (
          <div
            key={task.id}
            className={`p-4 rounded-2xl bg-surface border transition-colors flex flex-col gap-2 ${
              isNew ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-border hover:border-blue-500/40'
            }`}
          >
            {/* Project + key + badge "Nou" */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: task.project.color }}
                />
                {task.project.name}
              </span>
              {task.taskKey && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400">
                  {task.taskKey}
                </span>
              )}
              {isNew && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 uppercase tracking-wide">
                  {t('board.newAssigned')}
                </span>
              )}
              {task.origin === 'QUICK' && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400">
                  {t('board.fromQuick')}
                </span>
              )}
            </div>

            {/* Title */}
            <p className="text-sm font-medium text-fg leading-snug break-words">{task.title}</p>
            {isNew && (
              <p className="text-[11px] text-amber-400/90">{t('board.toStart')}</p>
            )}

            {/* Status + schedule */}
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted">
              <span className="px-2 py-0.5 rounded-full bg-elevated border border-border">
                {task.columnType ? t(columnTypeKey(task.columnType)) : task.columnName}
              </span>
              {task.estimateMinutes != null && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatEstimate(task.estimateMinutes)}
                </span>
              )}
              {task.dayOfWeek != null && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {t(DOW_KEYS[task.dayOfWeek] || '')}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setPlanning(task)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition-colors"
              >
                {t('board.plan')}
              </button>
              <button
                onClick={() => navigate(`/projects/${task.project.id}/board`)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface text-muted hover:text-fg border border-border transition-colors"
              >
                {t('board.openBoard')}
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {planning && (
        <PlanTaskModal
          taskTitle={planning.title}
          taskKey={planning.taskKey}
          initialEstimateMinutes={planning.estimateMinutes}
          initialDayOfWeek={planning.dayOfWeek}
          onClose={() => setPlanning(null)}
          onSubmit={handlePlanSubmit}
        />
      )}
    </>
  );
}
