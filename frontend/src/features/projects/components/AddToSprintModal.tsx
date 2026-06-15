import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useBacklog } from '../hooks/useBacklog';
import { Sprint } from '../api/sprints';

interface AddToSprintModalProps {
  projectId: string;
  sprint: Sprint;
  onClose: () => void;
  /** Adds a single backlog task to the sprint. Returns once persisted. */
  onAdd: (taskId: string) => Promise<unknown>;
}

export default function AddToSprintModal({ projectId, sprint, onClose, onAdd }: AddToSprintModalProps) {
  const t = useT();
  const { tasks, loading, refetch } = useBacklog(projectId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAdd = async (taskId: string) => {
    setBusyId(taskId);
    try {
      await onAdd(taskId);
      await refetch();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-elevated rounded-2xl p-6 w-full max-w-md border border-border max-h-[85vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-1 text-fg">{t('pm.addToSprint')}</h3>
        <p className="text-sm text-muted mb-4 truncate">{sprint.name}</p>

        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">{t('pm.backlogEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border"
              >
                {task.taskKey && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md leading-tight bg-blue-500/15 text-blue-400 flex-shrink-0">
                    {task.taskKey}
                  </span>
                )}
                <span className="text-sm text-fg truncate flex-1 min-w-0">{task.title}</span>
                {task.storyPoints != null && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full leading-tight bg-violet-500/15 text-violet-400 flex-shrink-0">
                    {task.storyPoints}
                  </span>
                )}
                <button
                  onClick={() => handleAdd(task.id)}
                  disabled={busyId === task.id}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {busyId === task.id ? '…' : t('common.add')}
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
