import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { ProjectMember } from '../api/members';
import {
  BoardTask,
  BoardPriority,
  Label,
  CreateBoardTaskData,
  UpdateBoardTaskData,
  CreateLabelData,
} from '../api/board';
import { PRIORITIES, priorityKey } from './boardConstants';
import AssigneePicker from './AssigneePicker';
import LabelPicker from './LabelPicker';

interface BoardTaskModalProps {
  /** Edit mode when provided. */
  task?: BoardTask | null;
  /** Target column for new cards (create mode). */
  columnId?: string;
  members: ProjectMember[];
  labels: Label[];
  onClose: () => void;
  onCreate?: (data: CreateBoardTaskData) => Promise<unknown>;
  onUpdate?: (taskId: string, data: UpdateBoardTaskData) => Promise<unknown>;
  onAssign?: (taskId: string, userIds: string[]) => Promise<unknown>;
  onDelete?: (taskId: string) => Promise<unknown>;
  onCreateLabel?: (data: CreateLabelData) => Promise<Label>;
}

export default function BoardTaskModal({
  task,
  columnId,
  members,
  labels,
  onClose,
  onCreate,
  onUpdate,
  onAssign,
  onDelete,
  onCreateLabel,
}: BoardTaskModalProps) {
  const t = useT();
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<BoardPriority>(task?.priority || 'MEDIUM');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task?.assignees.map((a) => a.userId) || [],
  );
  const [labelIds, setLabelIds] = useState<string[]>(task?.labels.map((l) => l.id) || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleLabel = (id: string) =>
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError(t('common.error'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isEdit && task) {
        if (onUpdate) {
          await onUpdate(task.id, {
            title: title.trim(),
            description: description.trim() || undefined,
            priority,
            labelIds,
          });
        }
        // Assignment goes through a dedicated endpoint. Compara seturile.
        const prevIds = task.assignees.map((a) => a.userId);
        const changed =
          prevIds.length !== assigneeIds.length ||
          prevIds.some((id) => !assigneeIds.includes(id));
        if (onAssign && changed) {
          await onAssign(task.id, assigneeIds);
        }
      } else if (onCreate && columnId) {
        await onCreate({
          title: title.trim(),
          description: description.trim() || undefined,
          columnId,
          assigneeIds,
          priority,
          labelIds,
        });
      }
      onClose();
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !onDelete) return;
    try {
      await onDelete(task.id);
      onClose();
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-elevated rounded-2xl p-6 w-full max-w-lg border border-border max-h-[88vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4 text-fg">
          {isEdit ? t('board.editCard') : t('board.addCard')}
        </h3>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-fg mb-1 block">{t('board.addCard')}</label>
            <input
              type="text"
              value={title}
              autoFocus
              onChange={(e) => { setTitle(e.target.value); setError(''); }}
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-sm text-fg mb-1 block">{t('common.edit')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-fg mb-1.5 block">{t('board.priority')}</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    priority === p
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-surface border-border text-muted hover:text-fg'
                  }`}
                >
                  {t(priorityKey(p))}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-fg mb-1.5 block">{t('board.assignees')}</label>
            <AssigneePicker members={members} value={assigneeIds} onChange={setAssigneeIds} />
          </div>

          <div>
            <label className="text-sm text-fg mb-1.5 block">{t('board.labels')}</label>
            <LabelPicker
              labels={labels}
              selected={labelIds}
              onToggle={toggleLabel}
              onCreateLabel={onCreateLabel}
            />
          </div>

          <div className="flex gap-3 mt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-blue-600/20"
            >
              {loading ? t('common.saving') : t('common.save')}
            </button>
          </div>

          {isEdit && onDelete && (
            <div className="border-t border-border pt-3">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-red-400/60 hover:text-red-400 text-sm transition-colors"
                >
                  {t('board.deleteCard')}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-red-400">{t('board.deleteCard')}?</span>
                  <button onClick={handleDelete} className="text-sm text-red-400 font-bold hover:text-red-300">
                    {t('common.confirm')}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-sm text-muted hover:text-fg">
                    {t('common.cancel')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
