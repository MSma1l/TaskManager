import { useMemo, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useAssignedBoard } from '../hooks/useAssignedBoard';
import { AssignedBoardTask, AssignedZone } from '../api/assigned';
import { BoardCardBody } from '../../projects/components/BoardCard';
import { BoardPriority } from '../../projects/api/board';
import AssignedTaskDrawer from './AssignedTaskDrawer';

type SortMode = 'zone' | 'project' | 'priority';

const ZONE_LABEL_KEY: Record<AssignedZone, string> = {
  BACKLOG: 'assigned.zoneBacklog',
  PLANNED: 'assigned.zonePlanned',
  IN_PROGRESS: 'assigned.zoneInProgress',
  DONE: 'assigned.zoneDone',
  APPROVED: 'assigned.zoneApproved',
};

/** Ordinea prioritatilor (descrescator) si etichetele lor in gruparea „pe prioritate". */
const PRIORITY_ORDER: BoardPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const PRIORITY_LABEL_KEY: Record<BoardPriority, string> = {
  LOW: 'board.priorityLow',
  MEDIUM: 'board.priorityMedium',
  HIGH: 'board.priorityHigh',
  URGENT: 'board.priorityUrgent',
};

/** Card cu badge proiect + coloană, click → drawer. */
function AssignedCard({
  task,
  onClick,
}: {
  task: AssignedBoardTask;
  onClick: () => void;
}) {
  return (
    <div onClick={onClick} className="cursor-pointer">
      <div className="flex items-center gap-1.5 mb-1 px-0.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-elevated border border-border text-muted truncate max-w-[60%]">
          {task.projectName}
        </span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-300 truncate">
          {task.columnName}
        </span>
      </div>
      <BoardCardBody task={task} />
    </div>
  );
}

export default function AssignedBoard() {
  const t = useT();
  const [projectFilter, setProjectFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('zone');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [detail, setDetail] = useState<AssignedBoardTask | null>(null);

  const { data, loading, refetch } = useAssignedBoard(projectFilter || undefined);

  // Grupare „pe proiect": adunăm toate task-urile din zone și le regrupăm
  // după numele proiectului (ordinea zonelor se păstrează în fiecare grup).
  const projectGroups = useMemo(() => {
    if (!data) return [];
    const flat = data.zones.flatMap((z) => z.tasks);
    const byProject = new Map<string, { name: string; tasks: AssignedBoardTask[] }>();
    for (const tk of flat) {
      const g = byProject.get(tk.projectId) ?? { name: tk.projectName, tasks: [] };
      g.tasks.push(tk);
      byProject.set(tk.projectId, g);
    }
    return Array.from(byProject.values());
  }, [data]);

  // Grupare „pe prioritate": toate task-urile din zone, grupate descrescator
  // dupa prioritatea task-ului (URGENT → HIGH → MEDIUM → LOW), fara grupuri goale.
  const priorityGroups = useMemo(() => {
    if (!data) return [];
    const flat = data.zones.flatMap((z) => z.tasks);
    return PRIORITY_ORDER.map((prio) => ({
      prio,
      tasks: flat.filter((tk) => tk.priority === prio),
    })).filter((g) => g.tasks.length > 0);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div>
      {/* Controale: filtru proiect + sortare */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface border border-border text-sm text-fg outline-none focus:border-blue-500 transition-colors"
        >
          <option value="">{t('assigned.allProjects')}</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="flex items-center rounded-xl bg-surface border border-border overflow-hidden text-sm">
          <button
            onClick={() => setSortMode('zone')}
            className={`px-3 py-2 transition-colors ${
              sortMode === 'zone' ? 'bg-blue-600/20 text-blue-300' : 'text-muted hover:text-fg'
            }`}
          >
            {t('assigned.sortByZone')}
          </button>
          <button
            onClick={() => setSortMode('project')}
            className={`px-3 py-2 transition-colors ${
              sortMode === 'project' ? 'bg-blue-600/20 text-blue-300' : 'text-muted hover:text-fg'
            }`}
          >
            {t('assigned.sortByProject')}
          </button>
          <button
            onClick={() => setSortMode('priority')}
            className={`px-3 py-2 transition-colors ${
              sortMode === 'priority' ? 'bg-blue-600/20 text-blue-300' : 'text-muted hover:text-fg'
            }`}
          >
            {t('assigned.sortByPriority')}
          </button>
        </div>
      </div>

      {/* Board */}
      {sortMode === 'zone' ? (
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {data.zones.map((z) => (
            <div key={z.zone} className="flex flex-col w-72 flex-shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted truncate">
                  {z.label || t(ZONE_LABEL_KEY[z.zone])}
                </h3>
                <span className="text-xs text-muted/70 font-medium">{z.tasks.length}</span>
              </div>
              <div className="flex flex-col gap-2 px-1 min-h-[60px]">
                {z.tasks.map((tk) => (
                  <AssignedCard key={tk.id} task={tk} onClick={() => setDetail(tk)} />
                ))}
                {z.tasks.length === 0 && (
                  <p className="text-xs text-muted/60 text-center py-4">{t('board.noTasks')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : sortMode === 'priority' ? (
        <div className="flex flex-col gap-5">
          {priorityGroups.map((g) => (
            <div key={g.prio}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                {t(PRIORITY_LABEL_KEY[g.prio])} <span className="text-muted/70">{g.tasks.length}</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.tasks.map((tk) => (
                  <AssignedCard key={tk.id} task={tk} onClick={() => setDetail(tk)} />
                ))}
              </div>
            </div>
          ))}
          {priorityGroups.length === 0 && (
            <p className="text-sm text-muted text-center py-10">{t('board.noAssigned')}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {projectGroups.map((g) => (
            <div key={g.name}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                {g.name} <span className="text-muted/70">{g.tasks.length}</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.tasks.map((tk) => (
                  <AssignedCard key={tk.id} task={tk} onClick={() => setDetail(tk)} />
                ))}
              </div>
            </div>
          ))}
          {projectGroups.length === 0 && (
            <p className="text-sm text-muted text-center py-10">{t('board.noAssigned')}</p>
          )}
        </div>
      )}

      {/* Arhivă (colapsabilă) */}
      {data.archived.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <button
            onClick={() => setArchiveOpen((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${archiveOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {t('assigned.archive')}
            <span className="text-muted/70">({data.archived.length})</span>
          </button>
          {archiveOpen && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3 opacity-80">
              {data.archived.map((tk) => (
                <AssignedCard key={tk.id} task={tk} onClick={() => setDetail(tk)} />
              ))}
            </div>
          )}
        </div>
      )}

      {detail && (
        <AssignedTaskDrawer
          task={detail}
          projectId={detail.projectId}
          columnName={detail.columnName}
          onClose={() => setDetail(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}
