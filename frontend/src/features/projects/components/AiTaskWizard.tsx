import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import {
  aiApi,
  AiAnswers,
  AiQuestion,
  AiSource,
  EstimateResult,
} from '../api/ai';
import { ProjectMember } from '../api/members';
import AssigneePicker from './AssigneePicker';

interface AiTaskWizardProps {
  projectId: string;
  members: ProjectMember[];
  onClose: () => void;
  /** Called after a task is successfully created (into the backlog). */
  onCreated: () => void;
}

type Step = 'input' | 'questions' | 'estimate';

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

export default function AiTaskWizard({ projectId, members, onClose, onCreated }: AiTaskWizardProps) {
  const t = useT();
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  const [questions, setQuestions] = useState<AiQuestion[]>([]);
  const [questionsSource, setQuestionsSource] = useState<AiSource>('');
  const [answers, setAnswers] = useState<AiAnswers>({});

  const [estimate, setEstimate] = useState<EstimateResult | null>(null);

  const handleGetQuestions = async () => {
    if (!title.trim()) {
      setError(t('common.error'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await aiApi.taskQuestions({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setQuestions(res.questions);
      setQuestionsSource(res.source);
      setStep('questions');
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleEstimate = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await aiApi.estimate(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        answers,
      });
      setEstimate(res);
      setStep('estimate');
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setError('');
    setLoading(true);
    try {
      await aiApi.createTask(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        // Refoloseste story points-ul deja estimat — fara re-apel AI la creare.
        storyPoints: estimate?.storyPoints,
        assigneeId: assigneeId || undefined,
      });
      onCreated();
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
        className="bg-elevated rounded-2xl p-6 w-full max-w-lg border border-border max-h-[88vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-fg">{t('pm.aiTask')}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-semibold">
            AI
          </span>
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
                rows={3}
                maxLength={2000}
                className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors resize-none"
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
                onClick={handleGetQuestions}
                disabled={loading || !title.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-blue-600/20"
              >
                {loading ? t('common.loading') : t('common.next')}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — questions */}
        {step === 'questions' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted">{t('pm.aiQuestions')}</p>
              <SourceBadge source={questionsSource} />
            </div>
            {questions.length === 0 ? (
              <p className="text-sm text-muted">{t('pm.noQuestions')}</p>
            ) : (
              questions.map((q) => (
                <div key={q.id}>
                  <label className="text-sm text-fg mb-1 block">{q.text}</label>
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors resize-none"
                  />
                </div>
              ))
            )}
            <div className="flex gap-3 mt-1">
              <button onClick={() => setStep('input')} className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors">
                {t('common.back')}
              </button>
              <button
                onClick={handleEstimate}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-blue-600/20"
              >
                {loading ? t('common.loading') : t('pm.estimate')}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — estimate */}
        {step === 'estimate' && estimate && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-surface border border-border">
              <div className="w-14 h-14 rounded-full bg-violet-500/15 text-violet-400 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                {estimate.storyPoints}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{t('pm.storyPoints')}</p>
                <SourceBadge source={estimate.source} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted mb-1 uppercase tracking-wide">{t('pm.rationale')}</p>
              <p className="text-sm text-fg whitespace-pre-wrap">{estimate.rationale}</p>
            </div>

            {estimate.shouldSplit && (
              <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/30">
                <p className="text-sm font-semibold text-amber-400 mb-1.5">{t('pm.shouldSplit')}</p>
                {estimate.suggestedSubtasks.length > 0 && (
                  <ul className="list-disc list-inside text-sm text-fg/90 space-y-0.5">
                    {estimate.suggestedSubtasks.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-1">
              <button onClick={() => setStep('questions')} className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors">
                {t('common.back')}
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
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
