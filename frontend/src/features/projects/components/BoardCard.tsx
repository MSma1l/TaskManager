import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useT } from '../../../shared/i18n/I18nProvider';
import { BoardAssignee, BoardTask, ColumnType, TransitionAction } from '../api/board';
import { PRIORITY_DOT, nextAction, actionKey } from './boardConstants';
import UserAvatar from '../../../shared/components/UserAvatar';
import { ZONE_META, deadlinePillText, formatDuration } from './zoneMeta';
import { useNow } from '../hooks/useNow';

interface WorkflowCtx {
  columnType: ColumnType | null;
  /** True when the current user is the assignee (or may act on the card). */
  isAssignee: boolean;
  /** True for OWNER/ADMIN — required to approve. */
  canApprove: boolean;
  /** Fires the contextual workflow action. `plan` opens the modal upstream. */
  onAction: (task: BoardTask, action: TransitionAction) => void;
}

interface BoardCardProps {
  task: BoardTask;
  onClick?: (task: BoardTask) => void;
  workflow?: WorkflowCtx;
}

/** Inner presentational card — shared by the sortable card and the drag overlay. */
export function BoardCardBody({
  task,
  dragging,
  workflow,
}: {
  task: BoardTask;
  dragging?: boolean;
  workflow?: WorkflowCtx;
}) {
  const t = useT();

  const hasRunning = (task.runningTimers?.length ?? 0) > 0;
  const now = useNow(hasRunning);
  const earliestStart = hasRunning
    ? Math.min(...task.runningTimers.map((r) => new Date(r.startedAt).getTime()))
    : 0;
  const runningElapsed = hasRunning ? Math.max(0, Math.floor((now - earliestStart) / 1000)) : 0;
  const zoneMeta = ZONE_META[task.zone] ?? ZONE_META.BACKLOG;

  // Decide whether to render a workflow button on this card.
  let action: TransitionAction | null = null;
  if (workflow) {
    const candidate = nextAction(workflow.columnType);
    if (candidate === 'approve') {
      if (workflow.canApprove) action = 'approve';
    } else if (candidate) {
      if (workflow.isAssignee || workflow.canApprove) action = candidate;
    }
  }

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (workflow && action) workflow.onAction(task, action);
  };

  // Atașamente: număr imagini / note vocale pentru badge-urile discrete din footer.
  const imageCount = task.attachments?.filter((a) => a.type === 'image').length ?? 0;
  const audioCount = task.attachments?.filter((a) => a.type === 'audio').length ?? 0;

  return (
    <div
      className={`rounded-xl bg-surface border border-border p-3 shadow-sm transition-all duration-150 hover:border-blue-500/40 hover:shadow-md ${
        dragging ? 'shadow-xl ring-1 ring-blue-500/40 rotate-1' : ''
      }`}
    >
      {/* Key + Labels + Story points */}
      {(task.taskKey ||
        task.labels.length > 0 ||
        task.storyPoints != null ||
        task.approvalStatus === 'NEEDS_FIX') && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {task.taskKey && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md leading-tight bg-blue-500/15 text-blue-400">
              {task.taskKey}
            </span>
          )}
          {task.approvalStatus === 'NEEDS_FIX' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-tight bg-amber-500/15 text-amber-400">
              {t('verify.needsFix')}
            </span>
          )}
          {task.storyPoints != null && (
            <span
              title={t('pm.storyPoints')}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-tight bg-violet-500/15 text-violet-400"
            >
              {task.storyPoints}
            </span>
          )}
          {task.labels.map((l) => (
            <span
              key={l.id}
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium text-fg leading-snug break-words">{task.title}</p>

      {/* Schedule meta */}
      {(task.estimateMinutes != null || task.dayOfWeek != null) && (
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted">
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
      )}

      {/* Deadline / zone pill + running-timer indicator */}
      {(task.dueDate || hasRunning) && (
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {task.dueDate && (
            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${zoneMeta.pill}`}>
              {deadlinePillText(t, task.daysRemaining, task.dueDate)}
            </span>
          )}
          {hasRunning && (
            <span
              title={t('taskTimer.running')}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-300"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
              {formatDuration(runningElapsed)}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2.5 text-muted">
          {/* Priority */}
          <span className="flex items-center gap-1" title={task.priority}>
            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority]}`} />
          </span>
          {/* Comments */}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {task.commentCount}
            </span>
          )}
          {/* Subtasks progress */}
          {task.subtasks && task.subtasks.length > 0 && (
            <span
              className="flex items-center gap-0.5 text-xs"
              title={t('subtasks.title')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
            </span>
          )}
          {/* Imagini atașate */}
          {imageCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs" title={t('attachments.image')}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {imageCount}
            </span>
          )}
          {/* Note vocale atașate */}
          {audioCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs" title={t('attachments.voiceNote')}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
              </svg>
              {audioCount}
            </span>
          )}
        </div>

        {/* Assignees (stivuiti, cu overflow +N) */}
        <AssigneeStack assignees={task.assignees} />
      </div>

      {/* Workflow action */}
      {action && (
        <button
          data-tour={`workflow-${action}`}
          onClick={handleActionClick}
          onPointerDown={(e) => e.stopPropagation()}
          className={`mt-2.5 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            action === 'approve'
              ? 'bg-green-600/20 text-green-300 hover:bg-green-600/30 border border-green-500/30'
              : 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30'
          }`}
        >
          {t(actionKey(action))}
        </button>
      )}
    </div>
  );
}

/** Avatare suprapuse pentru responsabili, cu badge "+N" la depasire. */
export function AssigneeStack({
  assignees,
  max = 3,
}: {
  assignees: BoardAssignee[];
  max?: number;
}) {
  if (!assignees || assignees.length === 0) return null;
  const shown = assignees.slice(0, max);
  const extra = assignees.length - shown.length;
  return (
    <div className="flex items-center flex-shrink-0">
      {shown.map((a, i) => (
        <UserAvatar
          key={a.userId}
          avatarUrl={a.avatarUrl}
          name={a.fullName || a.username || '?'}
          seed={a.userId}
          size={24}
          title={a.fullName || a.username || ''}
          className={`ring-2 ring-surface ${i > 0 ? '-ml-2' : ''}`}
        />
      ))}
      {extra > 0 && (
        <div className="w-6 h-6 -ml-2 rounded-full flex items-center justify-center text-[10px] font-semibold ring-2 ring-surface bg-surface border border-border text-muted">
          +{extra}
        </div>
      )}
    </div>
  );
}

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

export default function BoardCard({ task, onClick, workflow }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task)}
      className="cursor-grab active:cursor-grabbing touch-none"
    >
      <BoardCardBody task={task} workflow={workflow} />
    </div>
  );
}
