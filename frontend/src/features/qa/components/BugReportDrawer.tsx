import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../../shared/i18n/I18nProvider';
import { relativeTime } from '../../../shared/utils/dates';
import { useBugReport } from '../hooks/useBugReport';
import {
  BugStatus,
  BugSeverity,
  BugStep,
  BugStepResult,
  UpdateBugReportStep,
} from '../api/bugReports';
import {
  statusKey,
  statusColor,
  severityKey,
  severityColor,
  ALL_STATUSES,
  ALL_SEVERITIES,
} from './qaConstants';

interface BugReportDrawerProps {
  projectId: string;
  reportId: string;
  myRole?: string;
  onClose: () => void;
  /** Refresh the list after a mutation. */
  onChanged?: () => void;
  /** Delete the report (parent owns the list mutation). */
  onDeleted: () => void | Promise<void>;
}

/** Map the step entities into the wire shape the PUT endpoint expects. */
function toWireSteps(steps: BugStep[]): UpdateBugReportStep[] {
  return steps.map((s) => ({ id: s.id, text: s.text, done: s.done, result: s.result }));
}

export default function BugReportDrawer({
  projectId,
  reportId,
  onClose,
  onChanged,
  onDeleted,
}: BugReportDrawerProps) {
  const { t, lang } = useI18n();
  const {
    report,
    loading,
    update,
    addAttachment,
    removeAttachment,
    addComment,
    removeComment,
  } = useBugReport(projectId, reportId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);

  useEffect(() => {
    if (report) {
      setTitle(report.title);
      setDescription(report.description ?? '');
    }
  }, [report]);

  const persist = async (data: Parameters<typeof update>[0]) => {
    await update(data);
    onChanged?.();
  };

  const saveSteps = async (steps: BugStep[]) => {
    await persist({ steps: toWireSteps(steps) });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-md h-full max-h-[100dvh] bg-bg border-l border-border shadow-2xl flex flex-col overflow-hidden animate-[slidein_0.18s_ease-out]">
        {/* Header */}
        <div className="flex items-start gap-2 p-4 border-b border-border flex-shrink-0">
          <h2 className="flex-1 min-w-0 text-base font-bold text-fg leading-snug break-words">
            {report?.title || t('qa.tab')}
          </h2>
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

        {loading && !report ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !report ? (
          <div className="flex items-center justify-center flex-1">
            <p className="text-muted text-sm">{t('qa.empty')}</p>
          </div>
        ) : (
          <>
            {/* Body (scrollable) */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Editable title / description */}
              <div className="p-4 flex flex-col gap-4 border-b border-border">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">{t('qa.title')}</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => title.trim() && title.trim() !== report.title && persist({ title: title.trim() })}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">{t('qa.description')}</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => description !== (report.description ?? '') && persist({ description })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Status + severity */}
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[8rem]">
                    <label className="block text-xs font-semibold text-muted mb-1">{t('qa.status')}</label>
                    <select
                      value={report.status}
                      onChange={(e) => persist({ status: e.target.value as BugStatus })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold outline-none focus:border-blue-500 ${statusColor(report.status)}`}
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(statusKey(s))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[8rem]">
                    <label className="block text-xs font-semibold text-muted mb-1">{t('qa.severity')}</label>
                    <select
                      value={report.severity}
                      onChange={(e) => persist({ severity: e.target.value as BugSeverity })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold outline-none focus:border-blue-500 ${severityColor(report.severity)}`}
                    >
                      {ALL_SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {t(severityKey(s))}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Checklist of steps */}
              <StepsSection steps={report.steps} onSave={saveSteps} />

              {/* Image evidence */}
              <ImagesSection
                attachments={report.attachments}
                onUpload={async (data, caption) => {
                  await addAttachment(data, caption);
                  onChanged?.();
                }}
                onRemove={async (aid) => {
                  await removeAttachment(aid);
                  onChanged?.();
                }}
                onView={setViewImage}
              />

              {/* Comments */}
              <div className="p-4">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                  {t('qa.comments')}
                </h3>
                {report.comments.length === 0 ? (
                  <p className="text-sm text-muted text-center py-4">{t('collab.noComments')}</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {report.comments.map((c) => (
                      <div key={c.id} className="flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-fg">{c.username}</span>
                          <span className="text-xs text-muted">{relativeTime(c.createdAt, lang)}</span>
                          <button
                            onClick={async () => {
                              await removeComment(c.id);
                              onChanged?.();
                            }}
                            className="text-xs text-red-400/70 hover:text-red-400 ml-auto"
                          >
                            {t('qa.delete')}
                          </button>
                        </div>
                        <p className="text-sm text-fg/90 whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete report */}
              <div className="p-4 border-t border-border">
                {confirmDelete ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted">{t('qa.confirmDelete')}</span>
                    <button
                      onClick={() => onDeleted()}
                      className="text-sm text-red-400 font-semibold hover:text-red-300"
                    >
                      {t('common.confirm')}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="text-sm text-muted hover:text-fg">
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm font-semibold text-red-400/70 hover:text-red-400"
                  >
                    {t('qa.delete')}
                  </button>
                )}
              </div>
            </div>

            {/* Pinned comment composer */}
            <CommentComposer
              onAdd={async (body) => {
                await addComment(body);
                onChanged?.();
              }}
            />
          </>
        )}
      </div>

      {/* Lightbox */}
      {viewImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setViewImage(null)}
        >
          <img src={viewImage} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      <style>{`@keyframes slidein { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </div>
  );
}

// ── Steps checklist ──────────────────────────────────────────────────────────

function StepsSection({
  steps,
  onSave,
}: {
  steps: BugStep[];
  onSave: (steps: BugStep[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const [newStep, setNewStep] = useState('');

  const toggleDone = (id: string) =>
    onSave(steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));

  const setResult = (id: string, result: BugStepResult) =>
    onSave(steps.map((s) => (s.id === id ? { ...s, result } : s)));

  const editText = (id: string, text: string) =>
    onSave(steps.map((s) => (s.id === id ? { ...s, text } : s)));

  const removeStep = (id: string) => onSave(steps.filter((s) => s.id !== id));

  const addStep = () => {
    const text = newStep.trim();
    if (!text) return;
    // New step gets a synthetic id; the backend assigns the real one on PUT.
    const synthetic: BugStep = { id: `new-${Date.now()}`, text, done: false, result: null };
    onSave([...steps, synthetic]);
    setNewStep('');
  };

  return (
    <div className="p-4 border-b border-border">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('qa.steps')}</h3>
      <div className="flex flex-col gap-2">
        {steps.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.done}
              onChange={() => toggleDone(s.id)}
              className="w-4 h-4 flex-shrink-0 accent-blue-500"
              aria-label={t('qa.steps')}
            />
            <input
              defaultValue={s.text}
              onBlur={(e) => e.target.value.trim() !== s.text && editText(s.id, e.target.value.trim())}
              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setResult(s.id, s.result === 'PASS' ? null : 'PASS')}
              title={t('qa.passed')}
              className={`text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                s.result === 'PASS'
                  ? 'bg-green-500/15 text-green-400 border-green-500/30'
                  : 'bg-surface text-muted border-border hover:text-fg'
              }`}
            >
              ✓
            </button>
            <button
              onClick={() => setResult(s.id, s.result === 'FAIL' ? null : 'FAIL')}
              title={t('qa.failed')}
              className={`text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                s.result === 'FAIL'
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : 'bg-surface text-muted border-border hover:text-fg'
              }`}
            >
              ✕
            </button>
            <button
              onClick={() => removeStep(s.id)}
              className="text-red-400/60 hover:text-red-400 text-sm px-1 flex-shrink-0"
              aria-label={t('qa.delete')}
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStep()}
          placeholder={t('qa.addStep')}
          className="flex-1 px-2 py-1 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500"
        />
        <button
          onClick={addStep}
          disabled={!newStep.trim()}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-surface border border-border text-fg hover:bg-elevated disabled:opacity-40 transition-colors"
        >
          + {t('qa.addStep')}
        </button>
      </div>
    </div>
  );
}

// ── Image evidence ───────────────────────────────────────────────────────────

function ImagesSection({
  attachments,
  onUpload,
  onRemove,
  onView,
}: {
  attachments: { id: string; imageData: string; caption: string | null }[];
  onUpload: (imageData: string, caption?: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onView: (imageData: string) => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await onUpload(reader.result as string);
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 border-b border-border">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{t('qa.images')}</h3>
        <div className="flex-1" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-surface border border-border text-fg hover:bg-elevated disabled:opacity-40 transition-colors"
        >
          {uploading ? t('common.saving') : t('qa.uploadImage')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted">{t('qa.noImages')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative group">
              <img
                src={a.imageData}
                alt={a.caption ?? ''}
                onClick={() => onView(a.imageData)}
                className="w-full h-20 object-cover rounded-lg border border-border cursor-pointer"
              />
              <button
                onClick={() => onRemove(a.id)}
                aria-label={t('qa.delete')}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white text-xs hover:bg-red-600"
              >
                ✕
              </button>
              {a.caption && (
                <p className="text-[10px] text-muted truncate mt-0.5">{a.caption}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Comment composer (pinned) ────────────────────────────────────────────────

function CommentComposer({ onAdd }: { onAdd: (body: string) => Promise<void> }) {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await onAdd(body.trim());
      setBody('');
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-shrink-0 border-t border-border bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('qa.addComment')}
        rows={2}
        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-fg outline-none focus:border-blue-500 resize-none"
      />
      <div className="flex justify-end mt-2">
        <button
          onClick={send}
          disabled={!body.trim() || sending}
          className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {sending ? t('common.saving') : t('qa.send')}
        </button>
      </div>
    </div>
  );
}
