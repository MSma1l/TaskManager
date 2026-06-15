import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useSprints } from '../hooks/useSprints';
import { Sprint, SprintStatus } from '../api/sprints';
import { ProjectRole } from '../api/members';
import SprintModal from './SprintModal';
import AddToSprintModal from './AddToSprintModal';

interface SprintsPanelProps {
  projectId: string;
  myRole?: ProjectRole;
}

function statusKey(s: SprintStatus): string {
  switch (s) {
    case 'PLANNED': return 'pm.statusPlanned';
    case 'ACTIVE': return 'pm.statusActive';
    case 'COMPLETED': return 'pm.statusCompleted';
  }
}

function statusTint(s: SprintStatus): string {
  switch (s) {
    case 'PLANNED': return 'bg-surface text-muted border border-border';
    case 'ACTIVE': return 'bg-green-500/15 text-green-400';
    case 'COMPLETED': return 'bg-blue-500/15 text-blue-400';
  }
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function SprintsPanel({ projectId, myRole }: SprintsPanelProps) {
  const t = useT();
  const { sprints, loading, create, remove, start, complete, addTask } = useSprints(projectId);

  const canManage = myRole === 'OWNER' || myRole === 'ADMIN' || myRole === undefined;

  const [showCreate, setShowCreate] = useState(false);
  const [addToSprint, setAddToSprint] = useState<Sprint | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-lg font-bold text-fg">{t('pm.sprints')}</h2>
        <div className="flex-1" />
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20"
          >
            + {t('pm.createSprint')}
          </button>
        )}
      </div>

      {loading && sprints.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sprints.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted">{t('pm.noSprints')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sprints.map((s) => (
            <div key={s.id} className="rounded-2xl bg-surface border border-border p-4">
              {/* Header */}
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-fg truncate">{s.name}</h3>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusTint(s.status)}`}>
                      {t(statusKey(s.status))}
                    </span>
                  </div>
                  {s.goal && <p className="text-sm text-muted mt-0.5">{s.goal}</p>}
                  <p className="text-xs text-muted mt-1">
                    {fmtDate(s.startDate)} → {fmtDate(s.endDate)}
                    {' · '}
                    {s.totalPoints} {t('pm.points')} · {s.taskCount} {t('pm.tasks')}
                  </p>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setAddToSprint(s)}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-surface hover:bg-elevated border border-border text-fg transition-colors"
                    >
                      + {t('pm.addToSprint')}
                    </button>
                    {s.status === 'PLANNED' && (
                      <button
                        onClick={() => start(s.id)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-600/20 text-green-300 hover:bg-green-600/30 border border-green-500/30 transition-colors"
                      >
                        {t('pm.startSprint')}
                      </button>
                    )}
                    {s.status === 'ACTIVE' && (
                      <button
                        onClick={() => complete(s.id)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition-colors"
                      >
                        {t('pm.completeSprint')}
                      </button>
                    )}
                    {confirmDelete === s.id ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={async () => { await remove(s.id); setConfirmDelete(null); }}
                          className="text-xs text-red-400 font-semibold hover:text-red-300"
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-muted hover:text-fg"
                        >
                          {t('common.cancel')}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(s.id)}
                        title={t('common.delete')}
                        className="text-red-400/60 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Per-member capacity bars */}
              {s.perMember.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">{t('pm.capacity')}</p>
                  {s.perMember.map((m) => {
                    const ratio = m.capacityPoints > 0 ? Math.min(m.points / m.capacityPoints, 1) : 0;
                    return (
                      <div key={m.userId} className="flex items-center gap-2">
                        <span className="text-xs text-fg w-28 truncate flex-shrink-0">{m.username}</span>
                        <div className="flex-1 h-2 rounded-full bg-bg overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${m.overCapacity ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </div>
                        <span className={`text-xs w-16 text-right flex-shrink-0 ${m.overCapacity ? 'text-red-400 font-semibold' : 'text-muted'}`}>
                          {m.points}/{m.capacityPoints}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <SprintModal onClose={() => setShowCreate(false)} onCreate={create} />
      )}
      {addToSprint && (
        <AddToSprintModal
          projectId={projectId}
          sprint={addToSprint}
          onClose={() => setAddToSprint(null)}
          onAdd={(taskId) => addTask(addToSprint.id, taskId)}
        />
      )}
    </div>
  );
}
