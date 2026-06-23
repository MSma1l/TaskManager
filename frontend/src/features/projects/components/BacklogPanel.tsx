import { useState, useEffect, useCallback } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useBacklog } from '../hooks/useBacklog';
import { useMembers } from '../hooks/useMembers';
import { boardApi, BoardTask, BoardColumn, CreateBoardTaskData } from '../api/board';
import { ProjectRole } from '../api/members';
import { AssigneeStack } from './BoardCard';
import AiTaskWizard from './AiTaskWizard';
import SprintPlannerModal from './SprintPlannerModal';
import ManualBacklogTaskModal from './ManualBacklogTaskModal';

interface BacklogPanelProps {
  projectId: string;
  myRole?: ProjectRole;
}

export default function BacklogPanel({ projectId, myRole }: BacklogPanelProps) {
  const t = useT();
  const { tasks, loading, refetch } = useBacklog(projectId);
  const { members } = useMembers(projectId);

  // Resolve the BACKLOG column so manual creation lands in the backlog.
  const [backlogColumn, setBacklogColumn] = useState<BoardColumn | null>(null);

  const loadBacklogColumn = useCallback(async () => {
    if (!projectId) return;
    try {
      const board = await boardApi.getBoard(projectId);
      const col =
        board.columns.find((c) => c.columnType === 'BACKLOG') ??
        [...board.columns].sort((a, b) => a.position - b.position)[0] ??
        null;
      setBacklogColumn(col);
    } catch {
      // ignore — manual create button will be hidden until resolved
    }
  }, [projectId]);

  useEffect(() => { loadBacklogColumn(); }, [loadBacklogColumn]);

  const canManage = myRole === 'OWNER' || myRole === 'ADMIN' || myRole === 'MEMBER' || myRole === undefined;

  const [showAi, setShowAi] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const handleManualCreate = async (data: CreateBoardTaskData) => {
    await boardApi.createTask(projectId, data);
    await refetch();
  };

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <h2 className="text-lg font-bold text-fg">{t('pm.backlog')}</h2>
        <span className="text-xs text-muted">
          {tasks.length} {t('pm.tasks')}
        </span>
        <div className="flex-1" />
        {canManage && (
          <>
            <button
              onClick={() => setShowManual(true)}
              disabled={!backlogColumn}
              className="px-3 py-2 rounded-xl bg-surface hover:bg-elevated border border-border text-sm text-fg transition-colors disabled:opacity-50"
            >
              + {t('pm.task')}
            </button>
            <button
              onClick={() => setShowAi(true)}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-violet-600/20 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              {t('pm.aiTask')}
            </button>
            <button
              onClick={() => setShowPlanner(true)}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-violet-600/20 flex items-center gap-1.5"
            >
              <span aria-hidden>✨</span>
              {t('pm.planSprint')}
            </button>
          </>
        )}
      </div>

      {loading && tasks.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted">{t('pm.backlogEmpty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <BacklogRow key={task.id} task={task} />
          ))}
        </div>
      )}

      {showAi && (
        <AiTaskWizard
          projectId={projectId}
          members={members}
          onClose={() => setShowAi(false)}
          onCreated={refetch}
        />
      )}
      {showPlanner && (
        <SprintPlannerModal
          projectId={projectId}
          onClose={() => setShowPlanner(false)}
          onCreated={refetch}
        />
      )}
      {showManual && backlogColumn && (
        <ManualBacklogTaskModal
          columnId={backlogColumn.id}
          members={members}
          onClose={() => setShowManual(false)}
          onCreate={handleManualCreate}
        />
      )}
    </div>
  );
}

function BacklogRow({ task }: { task: BoardTask }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border">
      {task.taskKey && (
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md leading-tight bg-blue-500/15 text-blue-400 flex-shrink-0">
          {task.taskKey}
        </span>
      )}
      <p className="text-sm text-fg truncate flex-1 min-w-0">{task.title}</p>
      {task.storyPoints != null && (
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full leading-tight bg-violet-500/15 text-violet-400 flex-shrink-0">
          {task.storyPoints}
        </span>
      )}
      <AssigneeStack assignees={task.assignees} />
    </div>
  );
}
