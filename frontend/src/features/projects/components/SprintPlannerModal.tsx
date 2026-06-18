import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { aiApi, AiSource } from '../api/ai';

interface SprintPlannerModalProps {
  projectId: string;
  onClose: () => void;
  /** Called after tasks are successfully created (into the backlog). */
  onCreated: () => void;
}

type Step = 'brief' | 'review';

/** Editable row state — story points kept as string so the input can be cleared while typing. */
interface DraftTask {
  id: string;
  title: string;
  description: string;
  storyPoints: string;
  /** Subtasks, one per line in the textarea. */
  subtasks: string;
  dueDate: string; // yyyy-mm-dd
  dependencies: string[]; // read-only, informational
}

let rowSeq = 0;
const newRowId = () => `row_${rowSeq++}`;

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

/** Small pill showing whether the plan came from the AI model or the rule-based fallback. */
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

export default function SprintPlannerModal({ projectId, onClose, onCreated }: SprintPlannerModalProps) {
  const t = useT();
  const [step, setStep] = useState<Step>('brief');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [brief, setBrief] = useState('');
  const [source, setSource] = useState<AiSource>('');
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  /** Pull a clear message out of an axios-style error (e.g. backend 502 detail). */
  const errMessage = (e: unknown, fallback: string): string => {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail ? detail : fallback;
  };

  const handleGenerate = async () => {
    if (!brief.trim()) {
      setError(t('pm.emptyBriefError'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await aiApi.planSprint(projectId, brief.trim());
      setSource(res.source);
      setDrafts(
        res.tasks.map((task) => ({
          id: newRowId(),
          title: task.title,
          description: task.description ?? '',
          storyPoints: String(clampSp(String(task.storyPoints ?? 1))),
          subtasks: (task.subtasks ?? []).join('\n'),
          dueDate: isoToDateInput(task.dueDate),
          dependencies: task.dependencies ?? [],
        })),
      );
      setStep('review');
    } catch (e) {
      setError(errMessage(e, t('pm.aiInvalid')));
    } finally {
      setLoading(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<DraftTask>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const removeDraft = (id: string) => setDrafts((prev) => prev.filter((d) => d.id !== id));

  const addBlankRow = () => {
    const id = newRowId();
    setDrafts((prev) => [
      ...prev,
      { id, title: '', description: '', storyPoints: '1', subtasks: '', dueDate: '', dependencies: [] },
    ]);
    setExpanded((prev) => ({ ...prev, [id]: true }));
  };

  const hasBlankTitle = drafts.some((d) => !d.title.trim());
  const canCreate = drafts.length > 0 && !hasBlankTitle;

  const handleCreate = async () => {
    if (!canCreate) {
      setError(t('pm.titleRequired'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await aiApi.applyPlan(
        projectId,
        drafts.map((d) => ({
          title: d.title.trim(),
          description: d.description.trim() || undefined,
          storyPoints: clampSp(d.storyPoints),
          subtasks: d.subtasks
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          dueDate: d.dueDate ? `${d.dueDate}T17:00:00` : null,
        })),
      );
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
        className="bg-elevated rounded-2xl p-6 w-full max-w-2xl border border-border max-h-[88vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-fg">{t('pm.planSprint')}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-semibold">
            AI
          </span>
          {step === 'review' && <SourceBadge source={source} />}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Step 1 — brief */}
        {step === 'brief' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm text-fg mb-1 block">{t('pm.sprintBrief')}</label>
              <textarea
                value={brief}
                autoFocus
                onChange={(e) => { setBrief(e.target.value); setError(''); }}
                rows={8}
                maxLength={4000}
                placeholder={t('pm.briefPlaceholder')}
                className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>
            <div className="flex gap-3 mt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading || !brief.trim()}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-violet-600/20"
              >
                {loading ? t('common.loading') : t('pm.generateTasks')}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — editable review */}
        {step === 'review' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">{t('pm.proposedTasks')}</p>

            {drafts.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">{t('pm.noPlannedTasks')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {drafts.map((d) => {
                  const isOpen = expanded[d.id] ?? false;
                  return (
                    <div key={d.id} className="p-3 rounded-xl bg-surface border border-border flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={d.title}
                          onChange={(e) => { updateDraft(d.id, { title: e.target.value }); setError(''); }}
                          maxLength={200}
                          placeholder={t('pm.taskTitle')}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-bg border border-border text-fg text-sm outline-none focus:border-blue-500 transition-colors"
                        />
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={d.storyPoints}
                          onChange={(e) => updateDraft(d.id, { storyPoints: e.target.value })}
                          onBlur={(e) => updateDraft(d.id, { storyPoints: String(clampSp(e.target.value)) })}
                          title={t('pm.storyPoints')}
                          className="w-16 px-2 py-2 rounded-lg bg-bg border border-border text-fg text-sm text-center outline-none focus:border-blue-500 transition-colors flex-shrink-0"
                        />
                        <button
                          onClick={() => removeDraft(d.id)}
                          title={t('pm.removeTask')}
                          className="w-8 h-8 rounded-lg bg-bg border border-border text-muted hover:text-red-400 hover:border-red-500/40 transition-colors flex items-center justify-center flex-shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                      <button
                        onClick={() => setExpanded((prev) => ({ ...prev, [d.id]: !isOpen }))}
                        className="self-start text-xs text-muted hover:text-fg transition-colors"
                      >
                        {isOpen ? '▾' : '▸'} {t('pm.taskDescription')}
                      </button>
                      {isOpen && (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={d.description}
                            onChange={(e) => updateDraft(d.id, { description: e.target.value })}
                            rows={3}
                            maxLength={2000}
                            placeholder={t('pm.taskDescription')}
                            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-fg text-sm outline-none focus:border-blue-500 transition-colors resize-none"
                          />
                          <label className="text-xs text-muted">{t('pm.subtasks')}</label>
                          <textarea
                            value={d.subtasks}
                            onChange={(e) => updateDraft(d.id, { subtasks: e.target.value })}
                            rows={3}
                            placeholder={t('pm.subtasksHint')}
                            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-fg text-sm outline-none focus:border-blue-500 transition-colors resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted">{t('pm.dueDate')}</label>
                            <input
                              type="date"
                              value={d.dueDate}
                              onChange={(e) => updateDraft(d.id, { dueDate: e.target.value })}
                              className="px-3 py-1.5 rounded-lg bg-bg border border-border text-fg text-sm outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                          {d.dependencies.length > 0 && (
                            <div>
                              <label className="text-xs text-muted">{t('pm.dependencies')}</label>
                              <ul className="list-disc list-inside text-xs text-muted space-y-0.5 mt-0.5">
                                {d.dependencies.map((dep, i) => (
                                  <li key={i}>{dep}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={addBlankRow}
              className="self-start text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors"
            >
              + {t('pm.addRow')}
            </button>

            <div className="flex flex-wrap gap-3 mt-1">
              <button
                onClick={() => { setStep('brief'); setError(''); }}
                className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors"
              >
                {t('common.back')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading || !brief.trim()}
                className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? t('common.loading') : t('pm.regenerate')}
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !canCreate}
                className="flex-1 min-w-[160px] py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-green-600/20"
              >
                {loading
                  ? t('common.saving')
                  : `${t('pm.createAllInBacklog')} (${drafts.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
