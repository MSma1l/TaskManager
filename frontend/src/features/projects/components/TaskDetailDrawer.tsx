import { useState, useRef, useMemo } from 'react';
import { useI18n } from '../../../shared/i18n/I18nProvider';
import { relativeTime } from '../../../shared/utils/dates';
import { BoardTask, TransitionAction, ColumnType, UpdateBoardTaskData } from '../api/board';
import SubtaskChecklist from './SubtaskChecklist';
import { ProjectMember } from '../api/members';
import { TaskActivity } from '../api/activity';
import { TaskComment } from '../api/comments';
import { avatarTint, nextAction, actionKey, priorityKey } from './boardConstants';
import { activityLine } from './activityText';
import { detectMention, insertMention as insertMentionToken } from './mention';
import { useComments } from '../hooks/useComments';
import { useTaskActivity } from '../hooks/useTaskActivity';
import { useWatchers } from '../hooks/useWatchers';
import AssigneePicker from './AssigneePicker';
import TaskAttachments from '../../../shared/components/TaskAttachments';

interface TaskDetailDrawerProps {
  task: BoardTask;
  /** Column type of the card's column — drives the workflow action button. */
  columnType: ColumnType | null;
  columnName: string;
  members: ProjectMember[];
  myUserId: string | null;
  canApprove: boolean;
  onClose: () => void;
  onEdit: (task: BoardTask) => void;
  onWorkflowAction: (task: BoardTask, action: TransitionAction) => void;
  /** Actualizează câmpuri ale task-ului (ex: story points inline). */
  onUpdate?: (taskId: string, data: UpdateBoardTaskData) => Promise<unknown> | void;
  /** Schimbă responsabilii direct din drawer (orice membru poate). */
  onAssign?: (taskId: string, userIds: string[]) => Promise<unknown> | void;
  /** Subtaskuri (checklist) — disponibile doar pentru membri care pot edita. */
  onAddSubtask?: (taskId: string, title: string) => Promise<unknown> | void;
  onToggleSubtask?: (taskId: string, subtaskId: string, done: boolean) => Promise<unknown> | void;
  onRemoveSubtask?: (taskId: string, subtaskId: string) => Promise<unknown> | void;
}

type Tab = 'comments' | 'activity';

export default function TaskDetailDrawer({
  task,
  columnType,
  columnName,
  members,
  myUserId,
  canApprove,
  onClose,
  onEdit,
  onWorkflowAction,
  onUpdate,
  onAssign,
  onAddSubtask,
  onToggleSubtask,
  onRemoveSubtask,
}: TaskDetailDrawerProps) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>('comments');
  const [assigning, setAssigning] = useState(false);
  const [savingSp, setSavingSp] = useState(false);

  const { comments, add, edit, remove } = useComments(task.id);
  const { activity } = useTaskActivity(task.id);
  const { watchers, isWatching, toggle } = useWatchers(task.id, myUserId);

  // ── Workflow action for the drawer footer (mirror BoardCard logic). ──────────
  const candidate = nextAction(columnType);
  const isAssignee = !!myUserId && task.assignees.some((a) => a.userId === myUserId);
  let action: TransitionAction | null = null;
  if (candidate === 'approve') {
    if (canApprove) action = 'approve';
  } else if (candidate) {
    if (isAssignee || canApprove) action = candidate;
  }

  const assigneeIds = task.assignees.map((a) => a.userId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full max-h-[100dvh] bg-bg border-l border-border shadow-2xl flex flex-col overflow-hidden animate-[slidein_0.18s_ease-out]">
        {/* Header */}
        <div className="flex items-start gap-2 p-4 border-b border-border flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
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
              {task.approvalStatus === 'PENDING_REVIEW' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-tight bg-blue-500/15 text-blue-300">
                  {t('verify.pendingReview')}
                </span>
              )}
              {task.storyPoints != null && (
                <span
                  title={t('pm.storyPoints')}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-tight bg-violet-500/15 text-violet-400"
                >
                  {task.storyPoints} {t('pm.points')}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-fg leading-snug break-words">{task.title}</h2>
          </div>

          {/* Watch toggle */}
          <button
            onClick={toggle}
            title={isWatching ? t('collab.unwatch') : t('collab.watch')}
            aria-label={isWatching ? t('collab.unwatch') : t('collab.watch')}
            className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border transition-colors ${
              isWatching
                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                : 'bg-surface border-border text-muted hover:text-fg hover:bg-elevated'
            }`}
          >
            {isWatching ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zm0 12a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0-7a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.05 11.05 0 012.06-3.4M9.9 4.24A9.12 9.12 0 0112 4c5 0 9.27 3.11 11 7.5a11.05 11.05 0 01-4.09 5.06M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
              </svg>
            )}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-surface border border-border text-muted hover:text-fg hover:bg-elevated transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Meta section */}
          <div className="p-4 flex flex-col gap-4 border-b border-border">
            {task.description && (
              <p className="text-sm text-fg/90 leading-relaxed whitespace-pre-wrap break-words">
                {task.description}
              </p>
            )}

            <TaskAttachments attachments={task.attachments ?? []} />

            <div className="flex flex-col gap-2.5 text-sm">
              {/* Assignee — editabil: orice membru poate schimba responsabilul */}
              <div className="flex items-start gap-2">
                <span className="text-muted w-24 flex-shrink-0 pt-1.5">{t('board.assignees')}</span>
                {onAssign ? (
                  <div className="flex-1 min-w-0">
                    <AssigneePicker
                      members={members}
                      value={assigneeIds}
                      disabled={assigning}
                      onChange={async (ids) => {
                        setAssigning(true);
                        try {
                          await onAssign(task.id, ids);
                        } finally {
                          setAssigning(false);
                        }
                      }}
                    />
                  </div>
                ) : task.assignees.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-2 text-fg pt-1">
                    {task.assignees.map((a) => (
                      <span key={a.userId} className="flex items-center gap-1.5">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarTint(
                            a.userId,
                          )}`}
                        >
                          {(a.fullName || a.username).charAt(0).toUpperCase()}
                        </span>
                        {a.fullName || a.username}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted pt-1">{t('board.unassigned')}</span>
                )}
              </div>

              {/* Column / status */}
              <div className="flex items-center gap-2">
                <span className="text-muted w-24 flex-shrink-0">{t('collab.status')}</span>
                <span className="text-fg">{columnName}</span>
              </div>

              {/* Priority */}
              <div className="flex items-center gap-2">
                <span className="text-muted w-24 flex-shrink-0">{t('board.priority')}</span>
                <span className="text-fg">{t(priorityKey(task.priority))}</span>
              </div>

              {/* Story points — editabil inline (membri care pot edita) */}
              <div className="flex items-center gap-2">
                <span className="text-muted w-24 flex-shrink-0">{t('pm.storyPoints')}</span>
                {onUpdate ? (
                  <StoryPointsEditor
                    value={task.storyPoints}
                    disabled={savingSp}
                    onChange={async (v) => {
                      if (v === (task.storyPoints ?? null)) return;
                      setSavingSp(true);
                      try {
                        await onUpdate(task.id, { storyPoints: v ?? undefined });
                      } finally {
                        setSavingSp(false);
                      }
                    }}
                  />
                ) : (
                  <span className="text-fg">{task.storyPoints ?? '—'}</span>
                )}
              </div>
              {onUpdate && (task.storyPoints == null || task.storyPoints <= 0) && (
                <p className="text-xs text-amber-400/90 -mt-1">{t('pm.storyPointsRequired')}</p>
              )}

              {/* Due date */}
              {task.dueDate && (
                <div className="flex items-center gap-2">
                  <span className="text-muted w-24 flex-shrink-0">{t('collab.dueDate')}</span>
                  <span className="text-fg">{task.dueDate}</span>
                </div>
              )}

              {/* Watchers count */}
              <div className="flex items-center gap-2">
                <span className="text-muted w-24 flex-shrink-0">{t('collab.watchers')}</span>
                <span className="text-fg">{watchers.length}</span>
              </div>
            </div>

            {/* Labels */}
            {task.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {task.labels.map((l) => (
                  <span
                    key={l.id}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md leading-tight"
                    style={{ backgroundColor: `${l.color}22`, color: l.color }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            )}

            {/* Subtaskuri (checklist) */}
            <SubtaskChecklist
              subtasks={task.subtasks}
              onAdd={onAddSubtask ? (title) => onAddSubtask(task.id, title) : undefined}
              onToggle={
                onToggleSubtask ? (sid, done) => onToggleSubtask(task.id, sid, done) : undefined
              }
              onRemove={onRemoveSubtask ? (sid) => onRemoveSubtask(task.id, sid) : undefined}
            />

            {/* Actions: workflow + edit */}
            <div className="flex gap-2">
              {action && (
                <button
                  onClick={() => onWorkflowAction(task, action!)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors border ${
                    action === 'approve'
                      ? 'bg-green-600/20 text-green-300 hover:bg-green-600/30 border-green-500/30'
                      : 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border-blue-500/30'
                  }`}
                >
                  {t(actionKey(action))}
                </button>
              )}
              <button
                onClick={() => onEdit(task)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-surface border border-border text-fg hover:bg-elevated transition-colors"
              >
                {t('common.edit')}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border px-4 sticky top-0 bg-bg z-10">
            {(['comments', 'activity'] as Tab[]).map((tk) => (
              <button
                key={tk}
                onClick={() => setTab(tk)}
                className={`py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  tab === tk
                    ? 'border-blue-500 text-fg'
                    : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {tk === 'comments' ? t('collab.comments') : t('collab.activity')}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {tab === 'comments' ? (
              <CommentsList
                comments={comments}
                myUserId={myUserId}
                lang={lang}
                onEdit={edit}
                onRemove={remove}
              />
            ) : (
              <ActivityTab activity={activity} lang={lang} />
            )}
          </div>
        </div>

        {/* Composer — pinned at the panel bottom, outside the scroll region so it
            stays reachable no matter how many comments accumulate. */}
        {tab === 'comments' && (
          <CommentComposer members={members} onAdd={add} />
        )}
      </div>

      <style>{`@keyframes slidein { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </div>
  );
}

// ── Story points inline editor (stepper) ─────────────────────────────────────

function StoryPointsEditor({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled?: boolean;
  onChange: (v: number | null) => void;
}) {
  const current = value ?? 0;
  const commit = (v: number) => {
    const clamped = Math.max(0, Math.min(99, Number.isFinite(v) ? v : 0));
    onChange(clamped === 0 ? null : clamped);
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || current <= 0}
        onClick={() => commit(current - 1)}
        aria-label="−"
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface border border-border text-fg hover:bg-elevated disabled:opacity-40 transition-colors"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={99}
        value={current}
        disabled={disabled}
        onChange={(e) => commit(parseInt(e.target.value, 10))}
        className="w-14 text-center px-2 py-1 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => commit(current + 1)}
        aria-label="+"
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface border border-border text-fg hover:bg-elevated disabled:opacity-40 transition-colors"
      >
        +
      </button>
    </div>
  );
}

// ── Comments list (scrollable) ───────────────────────────────────────────────

function CommentsList({
  comments,
  myUserId,
  lang,
  onEdit,
  onRemove,
}: {
  comments: TaskComment[];
  myUserId: string | null;
  lang: 'ro' | 'ru';
  onEdit: (commentId: string, body: string) => Promise<void>;
  onRemove: (commentId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const startEdit = (c: TaskComment) => {
    setEditingId(c.id);
    setEditBody(c.body);
  };

  const saveEdit = async () => {
    if (!editingId || !editBody.trim()) return;
    await onEdit(editingId, editBody.trim());
    setEditingId(null);
    setEditBody('');
  };

  if (comments.length === 0) {
    return <p className="text-sm text-muted text-center py-6">{t('collab.noComments')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.map((c) => {
        const isMine = !!myUserId && c.userId === myUserId;
        const initials = (c.fullName || c.username).charAt(0).toUpperCase();
        return (
          <div key={c.id} className="flex gap-2.5">
            <span
              className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold ${avatarTint(
                c.userId,
              )}`}
            >
              {initials}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-fg">{c.fullName || c.username}</span>
                <span className="text-xs text-muted">{relativeTime(c.createdAt, lang)}</span>
              </div>
              {editingId === c.id ? (
                <div className="mt-1 flex flex-col gap-2">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-sm text-fg outline-none focus:border-blue-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="text-xs text-blue-400 font-semibold hover:text-blue-300">
                      {t('common.save')}
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-muted hover:text-fg">
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-fg/90 whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
                  {isMine && (
                    <div className="flex gap-3 mt-1">
                      <button onClick={() => startEdit(c)} className="text-xs text-muted hover:text-fg">
                        {t('collab.edit')}
                      </button>
                      <button onClick={() => onRemove(c.id)} className="text-xs text-red-400/70 hover:text-red-400">
                        {t('collab.delete')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Comment composer (pinned at the bottom of the drawer) ─────────────────────

function CommentComposer({
  members,
  onAdd,
}: {
  members: ProjectMember[];
  onAdd: (body: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── @mention autocomplete ──────────────────────────────────────────────────
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.username.toLowerCase().includes(q) || (m.fullName || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    const token = detectMention(e.target.value, e.target.selectionStart);
    setMentionQuery(token ? token.query : null);
  };

  const insertMention = (username: string) => {
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : body.length;
    const { text, caret: nextCaret } = insertMentionToken(body, caret, username);
    setBody(text);
    setMentionQuery(null);
    // Restore focus + caret after the inserted mention.
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = nextCaret;
      }
    });
  };

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await onAdd(body.trim());
      setBody('');
      setMentionQuery(null);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative flex-shrink-0 border-t border-border bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleChange}
        placeholder={t('collab.addComment')}
        rows={2}
        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-fg outline-none focus:border-blue-500 resize-none"
      />

      {/* Mention dropdown */}
      {mentionQuery !== null && mentionMatches.length > 0 && (
        <div className="absolute left-4 bottom-full mb-1 w-56 max-h-48 overflow-y-auto rounded-xl bg-surface border border-border shadow-xl z-20">
          {mentionMatches.map((m) => (
            <button
              key={m.userId}
              onClick={() => insertMention(m.username)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-elevated transition-colors"
            >
              <span
                className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold ${avatarTint(
                  m.userId,
                )}`}
              >
                {(m.fullName || m.username).charAt(0).toUpperCase()}
              </span>
              <span className="truncate">
                <span className="font-semibold">@{m.username}</span>
                {m.fullName && <span className="text-muted"> · {m.fullName}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-2">
        <button
          onClick={handleSend}
          disabled={!body.trim() || sending}
          className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {sending ? t('common.saving') : t('collab.send')}
        </button>
      </div>
    </div>
  );
}

// ── Activity tab ─────────────────────────────────────────────────────────────

function ActivityTab({ activity, lang }: { activity: TaskActivity[]; lang: 'ro' | 'ru' }) {
  const { t } = useI18n();

  if (activity.length === 0) {
    return <p className="text-sm text-muted text-center py-6">{t('collab.noActivity')}</p>;
  }

  // Newest first.
  const ordered = [...activity].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((a) => {
        const actor = a.username || t('collab.someone');
        const phrase = activityLine(t, a.action);
        return (
          <div key={a.id} className="flex gap-2.5 items-start">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 mt-2 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-fg/90">
                <span className="font-semibold text-fg">{actor}</span> {phrase}
              </p>
              <span className="text-xs text-muted">{relativeTime(a.createdAt, lang)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
