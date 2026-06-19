import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useBugReports } from '../hooks/useBugReports';
import { BugStatus, BugSeverity, CreateBugReportData } from '../api/bugReports';
import {
  statusKey,
  statusColor,
  severityKey,
  severityColor,
  ALL_STATUSES,
  ALL_SEVERITIES,
} from './qaConstants';
import BugReportDrawer from './BugReportDrawer';

interface QaPanelProps {
  projectId: string;
  myRole?: string;
}

export default function QaPanel({ projectId, myRole }: QaPanelProps) {
  const t = useT();
  const [filter, setFilter] = useState<BugStatus | undefined>(undefined);
  const { reports, loading, create, remove, refetch } = useBugReports(projectId, filter);

  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h2 className="text-lg font-bold text-fg">{t('qa.tab')}</h2>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20"
        >
          + {t('qa.newReport')}
        </button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <FilterChip active={filter === undefined} onClick={() => setFilter(undefined)}>
          {t('qa.filterAll')}
        </FilterChip>
        {ALL_STATUSES.map((s) => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {t(statusKey(s))}
          </FilterChip>
        ))}
      </div>

      {loading && reports.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted">{t('qa.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="text-left rounded-2xl bg-surface border border-border p-4 hover:bg-elevated transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(r.status)}`}
                >
                  {t(statusKey(r.status))}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${severityColor(r.severity)}`}
                >
                  {t(severityKey(r.severity))}
                </span>
              </div>
              <h3 className="text-sm font-bold text-fg break-words mb-2">{r.title}</h3>
              <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                <span title={t('qa.steps')}>
                  ✓ {r.stepsDone}/{r.stepsTotal}
                </span>
                <span title={t('qa.images')}>🖼 {r.attachmentCount}</span>
                <span title={t('qa.comments')}>💬 {r.commentCount}</span>
              </div>
              {r.assigneeName && (
                <p className="text-xs text-muted mt-2 truncate">{r.assigneeName}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateReportModal
          onClose={() => setShowCreate(false)}
          onCreate={async (data) => {
            const report = await create(data);
            setShowCreate(false);
            if (report) setOpenId(report.id);
          }}
        />
      )}

      {openId && (
        <BugReportDrawer
          projectId={projectId}
          reportId={openId}
          myRole={myRole}
          onClose={() => setOpenId(null)}
          onChanged={refetch}
          onDeleted={async () => {
            await remove(openId);
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
        active
          ? 'bg-blue-600/20 text-blue-300 border-blue-500/30'
          : 'bg-surface text-muted border-border hover:text-fg hover:bg-elevated'
      }`}
    >
      {children}
    </button>
  );
}

// ── Create report modal ──────────────────────────────────────────────────────

function CreateReportModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: CreateBugReportData) => Promise<void>;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('MEDIUM');
  const [steps, setSteps] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        severity,
        steps: cleanSteps.length > 0 ? cleanSteps.map((text) => ({ text })) : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 shadow-2xl max-h-[90dvh] overflow-y-auto">
        <h3 className="text-base font-bold text-fg mb-4">{t('qa.newReport')}</h3>

        <label className="block text-xs font-semibold text-muted mb-1">{t('qa.title')}</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500 mb-4"
          autoFocus
        />

        <label className="block text-xs font-semibold text-muted mb-1">{t('qa.description')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500 resize-none mb-4"
        />

        <label className="block text-xs font-semibold text-muted mb-1">{t('qa.severity')}</label>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as BugSeverity)}
          className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500 mb-4"
        >
          {ALL_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {t(severityKey(s))}
            </option>
          ))}
        </select>

        <label className="block text-xs font-semibold text-muted mb-1">{t('qa.steps')}</label>
        <div className="flex flex-col gap-2 mb-4">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={s}
                onChange={(e) =>
                  setSteps((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                }
                className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm text-fg outline-none focus:border-blue-500"
              />
              <button
                onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                className="text-red-400/60 hover:text-red-400 text-sm px-2"
                aria-label={t('qa.delete')}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setSteps((prev) => [...prev, ''])}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 self-start"
          >
            + {t('qa.addStep')}
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-muted hover:text-fg transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
