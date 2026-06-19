import { useEffect, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { projectsApi, Project } from '../../projects/api/projects';
import { membersApi, ProjectMember } from '../../projects/api/members';
import { QuickTask, QuickTaskPriority } from '../api/quicktasks';
import { useQuickTasks } from '../hooks/useQuickTasks';

const PRIORITY_BADGE: Record<QuickTaskPriority, string> = {
  URGENT: 'bg-red-500/15 text-red-500 border-red-500/30',
  NORMAL: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  LATER: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const PRIORITY_KEY: Record<QuickTaskPriority, string> = {
  URGENT: 'quick.priorityUrgent',
  NORMAL: 'quick.priorityNormal',
  LATER: 'quick.priorityLater',
};

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Inbox-ul de Quick Tasks pentru admini. */
export default function QuickTasksPage() {
  const t = useT();
  const { items, loading, assign, dismiss } = useQuickTasks('NEW');
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    projectsApi
      .getAll(['ACTIVE'])
      .then(setProjects)
      .catch(() => {});
  }, []);

  return (
    <div className="px-4 pt-5 max-w-[1000px] mx-auto pb-16">
      <h1 className="text-2xl font-bold tracking-tight mb-1">{t('quick.inboxTitle')}</h1>
      <p className="text-muted text-sm mb-6">{t('quick.inboxSubtitle')}</p>

      {loading && items.length === 0 ? (
        <p className="text-muted text-sm">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-muted text-sm">
          {t('quick.emptyInbox')}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((qt) => (
            <QuickTaskCard
              key={qt.id}
              quickTask={qt}
              projects={projects}
              onAssign={assign}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  quickTask: QuickTask;
  projects: Project[];
  onAssign: (id: string, projectId: string, assigneeId: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

function QuickTaskCard({ quickTask, projects, onAssign, onDismiss }: CardProps) {
  const t = useT();
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    setAssigneeId('');
    setMembers([]);
    if (!projectId) return;
    membersApi
      .list(projectId)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [projectId]);

  const handleAssign = async () => {
    if (!projectId || !assigneeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAssign(quickTask.id, projectId, assigneeId);
    } catch {
      setError(t('quick.errorAssign'));
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDismiss(quickTask.id);
    } catch {
      setError(t('quick.errorDismiss'));
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-fg truncate">{quickTask.title}</h3>
          <p className="text-xs text-muted mt-0.5">
            {quickTask.requesterName} · {formatTime(quickTask.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            PRIORITY_BADGE[quickTask.priority]
          }`}
        >
          {t(PRIORITY_KEY[quickTask.priority])}
        </span>
      </div>

      {quickTask.description && (
        <p className="text-sm text-muted whitespace-pre-wrap mb-4">{quickTask.description}</p>
      )}

      {quickTask.attachments && quickTask.attachments.length > 0 && (
        <div className="mb-4 space-y-3">
          {(() => {
            const images = quickTask.attachments!.filter((a) => a.type === 'image');
            const audios = quickTask.attachments!.filter((a) => a.type === 'audio');
            return (
              <>
                {images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {images.map((att, i) => (
                      <button
                        key={`img-${i}`}
                        type="button"
                        onClick={() => setLightbox(att.data)}
                        className="rounded-lg border border-border overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <img
                          src={att.data}
                          alt={att.caption || t('quick.attachImage')}
                          className="h-20 w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
                {audios.map((att, i) => (
                  <div key={`aud-${i}`} className="rounded-lg border border-border bg-elevated p-2">
                    <p className="text-xs text-muted mb-1">{t('quick.voiceNote')}</p>
                    <audio controls src={att.data} className="w-full" />
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={lightbox}
            alt={t('quick.attachImage')}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">{t('quick.pickProject')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          disabled={!projectId}
          className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
        >
          <option value="">{t('quick.pickAssignee')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.fullName || m.username}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAssign}
            disabled={!projectId || !assigneeId || busy}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {t('quick.assign')}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy}
            className="rounded-lg border border-border bg-elevated text-muted hover:text-fg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {t('quick.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
