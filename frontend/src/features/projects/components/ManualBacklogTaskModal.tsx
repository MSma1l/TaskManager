import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { ProjectMember } from '../api/members';
import { BoardPriority, CreateBoardTaskData } from '../api/board';
import { PRIORITIES, priorityKey } from './boardConstants';
import AssigneePicker from './AssigneePicker';

interface ManualBacklogTaskModalProps {
  columnId: string;
  members: ProjectMember[];
  onClose: () => void;
  onCreate: (data: CreateBoardTaskData) => Promise<unknown>;
}

export default function ManualBacklogTaskModal({
  columnId,
  members,
  onClose,
  onCreate,
}: ManualBacklogTaskModalProps) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<BoardPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [storyPoints, setStoryPoints] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError(t('common.error'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const sp = parseInt(storyPoints, 10);
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        columnId,
        assigneeId: assigneeId || undefined,
        priority,
        storyPoints: Number.isFinite(sp) && sp >= 0 ? sp : undefined,
      });
      onClose();
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-elevated rounded-2xl p-6 w-full max-w-md border border-border max-h-[88vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4 text-fg">{t('pm.task')}</h3>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-fg mb-1 block">{t('pm.taskTitle')}</label>
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
            <label className="text-sm text-fg mb-1 block">{t('pm.taskDescription')}</label>
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
            <label className="text-sm text-fg mb-1.5 block">{t('pm.storyPoints')}</label>
            <input
              type="number"
              min={0}
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
              placeholder="—"
              className="w-24 px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors text-center"
            />
          </div>

          <div>
            <label className="text-sm text-fg mb-1.5 block">{t('board.assignee')}</label>
            <AssigneePicker members={members} value={assigneeId} onChange={setAssigneeId} />
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
        </div>
      </div>
    </div>
  );
}
