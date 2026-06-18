import { Task } from '../api/tasks';
import { useT } from '../../../shared/i18n/I18nProvider';
import CategoryBadge from '../../../shared/components/ui/CategoryBadge';
import StatusBadge from '../../../shared/components/ui/StatusBadge';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  /** Quick action: marcheaza taskul „luat in lucru" (PENDING + nota). */
  onTakeInWork?: (task: Task) => void;
  /** Quick action: marcheaza taskul „Finalizat" (DONE). */
  onComplete?: (task: Task) => void;
}

export default function TaskCard({ task, onClick, onTakeInWork, onComplete }: TaskCardProps) {
  const t = useT();
  const completion = task.completions?.[0];
  const status = completion?.status || 'PENDING';
  const isPending = status === 'PENDING';
  const isDone = status === 'DONE';
  const isNotDone = status === 'NOT_DONE';
  // „In lucru" = PENDING cu nota setata (vezi completion_service.mark_started).
  const inProgress = isPending && !!completion?.note;
  const showQuickActions = isPending && (onTakeInWork || onComplete);

  const statusStyles: Record<string, string> = {
    PENDING: 'border-slate-600/50 bg-slate-700/50 hover:bg-slate-700 hover:border-slate-500',
    DONE: 'border-green-500/30 bg-green-900/20',
    SKIPPED: 'border-blue-500/30 bg-blue-900/20',
    NOT_DONE: 'border-red-500/30 bg-red-900/20',
  };

  return (
    <div
      onClick={() => onClick(task)}
      className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border ${statusStyles[status] || statusStyles.PENDING} ${
        !isPending ? 'opacity-70 hover:opacity-90' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          className="w-1.5 self-stretch rounded-full flex-shrink-0 min-h-[2rem]"
          style={{ backgroundColor: task.category.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`text-sm font-semibold truncate ${isDone ? 'line-through text-slate-400' : ''}`}>
              {task.title}
            </h4>
            {inProgress ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {t('weekly.inProgress')}
              </span>
            ) : (
              <StatusBadge status={status} />
            )}
          </div>
          {task.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <CategoryBadge
              icon={task.category.icon}
              name={task.category.name}
              color={task.category.color}
            />
            {task.project && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 truncate max-w-[140px]"
                style={{ backgroundColor: `${task.project.color}30`, color: task.project.color, border: `1px solid ${task.project.color}50` }}
                title={`Proiect: ${task.project.name}`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: task.project.color }} />
                <span className="truncate">{task.project.name}</span>
              </span>
            )}
            {task.priority && task.priority !== 'MEDIUM' && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                task.priority === 'URGENT' ? 'bg-red-600/30 text-red-300' :
                task.priority === 'HIGH' ? 'bg-orange-600/30 text-orange-300' :
                'bg-slate-600/30 text-slate-400'
              }`}>
                {task.priority === 'URGENT' ? 'URGENT' : task.priority === 'HIGH' ? 'HIGH' : 'LOW'}
              </span>
            )}
            {task.estimatedMinutes && (
              <span className="text-xs text-slate-400 flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {task.estimatedMinutes >= 60 ? `${Math.floor(task.estimatedMinutes / 60)}h${task.estimatedMinutes % 60 ? task.estimatedMinutes % 60 + 'm' : ''}` : `${task.estimatedMinutes}m`}
              </span>
            )}
            {task.reminderTime && (
              <span className="text-xs text-slate-400 flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {task.reminderTime}
              </span>
            )}
          </div>
          {isNotDone && completion?.skipReason && (
            <p className="text-xs text-red-400/80 mt-1.5 italic truncate">
              Motiv: {completion.skipReason}
            </p>
          )}
          {status === 'SKIPPED' && completion?.movedToDate && (
            <p className="text-xs text-blue-400/80 mt-1.5 italic">
              Mutat pe {new Date(completion.movedToDate).toLocaleDateString('ro-RO')}
            </p>
          )}
          {inProgress && completion?.note && (
            <p className="text-xs text-amber-300/80 mt-1.5 italic truncate">
              {completion.note}
            </p>
          )}
          {showQuickActions && (
            <div className="flex items-center gap-1.5 mt-2">
              {!inProgress && onTakeInWork && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTakeInWork(task); }}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 transition-colors"
                >
                  {t('weekly.takeInWork')}
                </button>
              )}
              {onComplete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onComplete(task); }}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-green-600/20 text-green-300 hover:bg-green-600/30 border border-green-500/30 transition-colors"
                >
                  {t('weekly.markDone')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
