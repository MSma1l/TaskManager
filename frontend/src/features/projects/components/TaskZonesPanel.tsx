import { useMemo } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useBoard } from '../hooks/useBoard';
import { BoardTask } from '../api/board';
import { ProjectZone } from '../api/projects';
import { ZONE_META, ZONE_ORDER, deadlinePillText, formatDuration } from './zoneMeta';
import { AssigneeStack } from './BoardCard';

interface TaskZonesPanelProps {
  projectId: string;
  /** Deschide board-ul (cardurile din zone trimit acolo). */
  onOpenBoard?: () => void;
}

/**
 * Read-only overview of every board task grouped by its computed priority zone.
 * Mirrors the project-level zones layout: 4 sections (URGENT→BACKLOG), each a
 * horizontally-scrolling row of compact task cards.
 */
export default function TaskZonesPanel({ projectId, onOpenBoard }: TaskZonesPanelProps) {
  const t = useT();
  const { board, loading } = useBoard(projectId);

  const tasks = useMemo<BoardTask[]>(
    () => (board ? board.columns.flatMap((c) => c.tasks) : []),
    [board],
  );

  if (loading && !board) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderCard = (task: BoardTask) => {
    const zoneMeta = ZONE_META[task.zone] ?? ZONE_META.BACKLOG;
    const hasTime = task.timeSpentSeconds > 0 || task.runningTimers.length > 0;
    return (
      <button
        key={task.id}
        type="button"
        onClick={onOpenBoard}
        className={`text-left min-w-[240px] max-w-[260px] shrink-0 p-3.5 rounded-2xl bg-surface border border-border ${zoneMeta.cardHover} hover:bg-elevated transition-all duration-200`}
      >
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          {task.taskKey && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400">
              {task.taskKey}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${zoneMeta.pill}`}>
              {deadlinePillText(t, task.daysRemaining, task.dueDate)}
            </span>
          )}
        </div>

        <p className="text-sm font-medium text-fg leading-snug break-words line-clamp-2">{task.title}</p>

        <div className="flex items-center justify-between mt-3 gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted min-w-0">
            {hasTime && (
              <span className="flex items-center gap-1">
                {task.runningTimers.length > 0 && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                  </span>
                )}
                {formatDuration(task.timeSpentSeconds)}
              </span>
            )}
          </div>
          <AssigneeStack assignees={task.assignees} />
        </div>
      </button>
    );
  };

  const renderZone = (zone: ProjectZone) => {
    const zoneMeta = ZONE_META[zone];
    const items = tasks.filter((tk) => tk.zone === zone);
    return (
      <section key={zone}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-1.5 h-10 rounded-full ${zoneMeta.accent}`} />
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${zoneMeta.badge}`}>
            {zoneMeta.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className={`text-base font-bold ${zoneMeta.headerText}`}>{t(zoneMeta.labelKey)}</h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${zoneMeta.badge}`}>{items.length}</span>
            </div>
            <p className="text-xs text-muted">{t(zoneMeta.subtitleKey)}</p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-5 py-6 text-sm text-muted">
            {t('projectZone.empty')}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x scroll-pl-1 [scrollbar-width:thin]">
            {items.map(renderCard)}
          </div>
        )}
      </section>
    );
  };

  return <div className="flex flex-col gap-7">{ZONE_ORDER.map(renderZone)}</div>;
}
