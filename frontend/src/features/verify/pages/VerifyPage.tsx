import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../../shared/i18n/I18nProvider';
import { avatarTint } from '../../projects/components/boardConstants';
import { PendingTask, verifyApi } from '../api/verify';

/**
 * Inbox-ul de verificare admin: task-uri raportate ca finalizate
 * (approval_status = PENDING_REVIEW) din proiectele în care utilizatorul
 * curent este ADMIN/OWNER. Acțiuni: Aprob / Întorc la Corectare / Reject.
 */
export default function VerifyPage() {
  const t = useT();
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await verifyApi.listPending();
      setTasks(data);
    } catch {
      // păstrăm ultima stare bună
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (taskId: string, fn: () => Promise<unknown>) => {
    setBusyId(taskId);
    try {
      await fn();
      // scoatem optimist task-ul rezolvat din listă
      setTasks((prev) => prev.filter((x) => x.id !== taskId));
    } catch {
      // la eroare, resincronizăm
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const approve = (taskId: string) => act(taskId, () => verifyApi.approve(taskId));

  const returnToFix = (taskId: string) => {
    const reason = window.prompt(t('verify.returnReasonPrompt'));
    if (reason === null) return;
    return act(taskId, () => verifyApi.returnToFix(taskId, reason.trim()));
  };

  const reject = (taskId: string) => {
    const reason = window.prompt(t('verify.rejectReasonPrompt'));
    if (reason === null) return;
    return act(taskId, () => verifyApi.reject(taskId, reason.trim()));
  };

  return (
    <div className="px-4 pt-5 max-w-[900px] mx-auto pb-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1 text-fg">{t('nav.verify')}</h1>
      <p className="text-muted text-sm mb-5">{t('verify.subtitle')}</p>

      {loading ? (
        <p className="text-muted text-sm">{t('common.loading')}</p>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl bg-surface border border-border p-8 text-center">
          <p className="text-muted text-sm">{t('verify.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <VerifyCard
              key={task.id}
              task={task}
              busy={busyId === task.id}
              onApprove={() => approve(task.id)}
              onReturn={() => returnToFix(task.id)}
              onReject={() => reject(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VerifyCard({
  task,
  busy,
  onApprove,
  onReturn,
  onReject,
}: {
  task: PendingTask;
  busy: boolean;
  onApprove: () => void;
  onReturn: () => void;
  onReject: () => void;
}) {
  const t = useT();
  const assigneeName = task.assignee
    ? task.assignee.fullName || task.assignee.username
    : null;
  const initials = assigneeName ? assigneeName.charAt(0).toUpperCase() : null;

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 shadow-sm">
      {/* Meta line */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {task.taskKey && (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md leading-tight bg-blue-500/15 text-blue-400">
            {task.taskKey}
          </span>
        )}
        {task.project && (
          <span className="text-xs font-semibold text-muted flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: task.project.color || '#64748b' }}
            />
            {task.project.name}
          </span>
        )}
        {task.storyPoints != null && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-tight bg-violet-500/15 text-violet-400">
            {task.storyPoints} {t('pm.points')}
          </span>
        )}
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-tight bg-blue-500/15 text-blue-300">
          {t('verify.pendingReview')}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-base font-bold text-fg leading-snug break-words">{task.title}</h3>

      {/* Description */}
      {task.description && (
        <p className="text-sm text-fg/80 leading-relaxed whitespace-pre-wrap break-words mt-1.5 line-clamp-4">
          {task.description}
        </p>
      )}

      {/* Footer meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm">
        <span className="flex items-center gap-2 text-fg">
          <span className="text-muted">{t('board.assignee')}:</span>
          {assigneeName ? (
            <span className="flex items-center gap-1.5">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarTint(
                  task.assignee?.userId || '',
                )}`}
              >
                {initials}
              </span>
              {assigneeName}
            </span>
          ) : (
            <span className="text-muted">{t('board.unassigned')}</span>
          )}
        </span>

        <Link
          to={`/projects/${task.projectId}/board`}
          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {t('collab.comments')}
          {task.commentCount > 0 && <span className="text-muted">({task.commentCount})</span>}
        </Link>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          disabled={busy}
          onClick={onApprove}
          className="flex-1 min-w-[120px] py-2 rounded-xl text-sm font-semibold border bg-green-600/20 text-green-300 hover:bg-green-600/30 border-green-500/30 disabled:opacity-50 transition-colors"
        >
          {t('verify.approve')}
        </button>
        <button
          disabled={busy}
          onClick={onReturn}
          className="flex-1 min-w-[120px] py-2 rounded-xl text-sm font-semibold border bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 border-amber-500/30 disabled:opacity-50 transition-colors"
        >
          {t('verify.return')}
        </button>
        <button
          disabled={busy}
          onClick={onReject}
          className="flex-1 min-w-[120px] py-2 rounded-xl text-sm font-semibold border bg-red-600/20 text-red-300 hover:bg-red-600/30 border-red-500/30 disabled:opacity-50 transition-colors"
        >
          {t('verify.reject')}
        </button>
      </div>
    </div>
  );
}
