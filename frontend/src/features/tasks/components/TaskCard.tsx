import { Task } from '../api/tasks';
import CategoryBadge from '../../../shared/components/ui/CategoryBadge';
import StatusBadge from '../../../shared/components/ui/StatusBadge';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const completion = task.completions?.[0];
  const status = completion?.status || 'PENDING';
  const isPending = status === 'PENDING';
  const isDone = status === 'DONE';
  const isNotDone = status === 'NOT_DONE';

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
            <StatusBadge status={status} />
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
        </div>
      </div>
    </div>
  );
}
