import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { aiApi, AiSource, GeneratedTask } from '../api/ai';
import { ProjectMember } from '../api/members';
import AssigneePicker from './AssigneePicker';

interface AiTaskWizardProps {
  projectId: string;
  members: ProjectMember[];
  onClose: () => void;
  /** Called after a task is successfully created (into the backlog). */
  onCreated: () => void;
}

type Step = 'input' | 'preview';

/** Small pill showing whether a result came from the AI model or the rule-based fallback. */
function SourceBadge({ source }: { source: AiSource }) {
  const t = useT();
  const isAi = source === 'AI' || source === 'ai';
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight ${
        isAi ? 'bg-violet-500/15 text-violet-400' : 'bg-surface text-muted border border-border'
      }`}
    >
      {t('pm.source')}: {isAi ? t('pm.sourceAi') : t('pm.sourceRules')}
    </span>
  );
}

const clampSp = (raw: string): number => {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, n));
};

/** ISO datetime -> yyyy-mm-dd for a <input type="date"> (empty if invalid). */
const isoToDateInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

export default function AiTaskWizard({ projectId, members, onClose, onCreated }: AiTaskWizardProps) {
  const t = useT();
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  // Preview (editable) state
  const [source, setSource] = useState<AiSource>('');
  const [rationale, setRationale] = useState('');
  const [storyPoints, setStoryPoints] = useState('1');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(''); // yyyy-mm-dd

  /** Pull a clear message out of an axios-style error (e.g. backend 502 detail). */
  const errMessage = (e: unknown, fallback: string): string => {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail ? detail : fallback;
  };

  const applyPreview = (task: GeneratedTask, src: AiSource) => {
    setSource(src);
    setRationale(task.rationale || '');
    setTitle(task.title || title);
    setDescription(task.description || description);
    setStoryPoints(String(clampSp(String(task.storyPoints ?? 1))));
    setSubtasks(Array.isArray(task.subtasks) ? task.subtasks : []);
    setDependencies(Array.isArray(task.dependencies) ? task.dependencies : []);
    setDueDate(isoToDateInput(task.dueDate));
  };

  const handleGenerate = async () => {
    if (!title.trim() && !description.trim()) {
      setError(t('common.error'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await aiApi.generateTask(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      applyPreview(res.task, res.source);
      setStep('preview');
    } catch (e) {
      setError(errMessage(e, t('pm.aiInvalid')));
    } finally {
      setLoading(false);
    }
  };

  const updateSubtask = (i: number, value: string) =>
    setSubtasks((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  const removeSubtask = (i: number) =>
    setSubtasks((prev) => prev.filter((_, idx) => idx !== i));
  const addSubtask = () => setSubtasks((prev) => [...prev, '']);

  const handleCreate = async () => {
    if (!title.trim()) {
      setError(t('pm.titleRequired'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await aiApi.createTask(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        storyPoints: clampSp(storyPoints),
        subtasks: subtasks.map((s) => s.trim()).filter(Boolean),
        dueDate: dueDate ? `${dueDate}T17:00:00` : null,
        assigneeId: assigneeIds[0] || undefined,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(errMessage(e, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-elevated rounded-2xl p-6 w-full max-w-lg border border-border max-h-[88vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-fg">{t('pm.aiTask')}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-semibold">
            AI
          </span>
          {step === 'preview' && <SourceBadge source={source} />}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Step 1 — input */}
        {step === 'input' && (
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
                rows={4}
                maxLength={2000}
                placeholder={t('pm.aiDescribePlaceholder')}
                className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>
            <div>
              <label className="text-sm text-fg mb-1.5 block">{t('board.assignee')}</label>
              <AssigneePicker members={members} value={assigneeIds} onChange={setAssigneeIds} />
            </div>
            <div className="flex gap-3 mt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading || (!title.trim() && !description.trim())}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-violet-600/20"
              >
                {loading ? t('common.loading') : t('pm.generate')}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — editable preview */}
        {step === 'preview' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm text-fg mb-1 block">{t('pm.taskTitle')}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(''); }}
                maxLength={200}
                className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm text-fg mb-1 block">{t('pm.storyPoints')}</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  onBlur={(e) => setStoryPoints(String(clampSp(e.target.value)))}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg text-center outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm text-fg mb-1 block">{t('pm.dueDate')}</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-fg mb-1 block">{t('pm.taskDescription')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={2000}
                className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-fg">{t('pm.subtasks')}</label>
                <button
                  onClick={addSubtask}
                  className="text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                >
                  + {t('pm.subtasks')}
                </button>
              </div>
              {subtasks.length === 0 ? (
                <p className="text-sm text-muted">{t('pm.noSubtasks')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {subtasks.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={s}
                        onChange={(e) => updateSubtask(i, e.target.value)}
                        maxLength={300}
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface border border-border text-fg text-sm outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        onClick={() => removeSubtask(i)}
                        title={t('pm.removeTask')}
                        className="w-8 h-8 rounded-lg bg-surface border border-border text-muted hover:text-red-400 hover:border-red-500/40 transition-colors flex items-center justify-center flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {dependencies.length > 0 && (
              <div>
                <label className="text-sm text-fg mb-1 block">{t('pm.dependencies')}</label>
                <ul className="list-disc list-inside text-sm text-muted space-y-0.5">
                  {dependencies.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            {rationale && (
              <div>
                <p className="text-xs font-semibold text-muted mb-1 uppercase tracking-wide">{t('pm.rationale')}</p>
                <p className="text-sm text-fg whitespace-pre-wrap">{rationale}</p>
              </div>
            )}

            <div className="flex gap-3 mt-1">
              <button
                onClick={() => { setStep('input'); setError(''); }}
                className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors"
              >
                {t('common.back')}
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !title.trim()}
                className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-green-600/20"
              >
                {loading ? t('common.saving') : t('pm.createTask')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
