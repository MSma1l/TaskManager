import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjects } from '../hooks/useProjects';
import AddProjectModal from '../components/AddProjectModal';
import { useT } from '../../../shared/i18n/I18nProvider';
import { Project, ProjectStatus, ProjectZone, UpdateProjectData } from '../api/projects';
import { ZONE_META, ZONE_ORDER } from '../components/zoneMeta';

type StatusFilter = 'ACTIVE' | 'ON_HOLD' | 'ARCHIVED' | 'ALL';
type Translate = (key: string) => string;

const FILTER_TO_STATUSES: Record<StatusFilter, ProjectStatus[] | undefined> = {
  ACTIVE: ['ACTIVE'],
  ON_HOLD: ['ON_HOLD'],
  ARCHIVED: ['ARCHIVED'],
  ALL: undefined,
};

const STATUS_META: Record<ProjectStatus, { icon: string; classes: string; key: string }> = {
  ACTIVE: { icon: '🟢', classes: 'bg-green-500/15 text-green-400', key: 'projectStatus.active' },
  ON_HOLD: { icon: '🟡', classes: 'bg-yellow-500/15 text-yellow-400', key: 'projectStatus.onHold' },
  ARCHIVED: { icon: '🔒', classes: 'bg-slate-500/15 text-muted', key: 'projectStatus.archived' },
};

const isZoneId = (id: string): id is ProjectZone => (ZONE_ORDER as string[]).includes(id);

/** Stable sort by `zoneOrder` (nulls last, original order preserved for ties). */
function sortByZoneOrder<T extends { zoneOrder: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.zoneOrder == null && b.zoneOrder == null) return 0;
    if (a.zoneOrder == null) return 1;
    if (b.zoneOrder == null) return -1;
    return a.zoneOrder - b.zoneOrder;
  });
}

const canEditStatus = (role?: string) => role === 'OWNER' || role === 'ADMIN';

/** Presentational card body — shared by the sortable card and the drag overlay. */
function ProjectCardBody({
  project,
  t,
  onStatusChange,
  onUnpin,
}: {
  project: Project;
  t: Translate;
  onStatusChange: (id: string, data: UpdateProjectData) => void;
  onUnpin: (id: string) => void;
}) {
  const meta = STATUS_META[project.status] ?? STATUS_META.ACTIVE;
  const zoneMeta = ZONE_META[project.zone] ?? ZONE_META.BACKLOG;
  const dimmed = project.status === 'ARCHIVED';

  const deadlineText = (): string => {
    if (project.daysRemaining === null) return t('projects.deadlineNone');
    if (project.daysRemaining < 0)
      return t('projects.deadlineOverdue').replace('{n}', String(Math.abs(project.daysRemaining)));
    if (project.daysRemaining === 0) return t('projects.deadlineToday');
    return t('projects.deadlineDays').replace('{n}', String(project.daysRemaining));
  };

  return (
    <div
      className={`min-w-[280px] max-w-[300px] p-5 rounded-2xl bg-slate-800/60 ${zoneMeta.cardBg} border border-slate-700/40 ${zoneMeta.cardHover} hover:bg-slate-800/80 transition-all duration-200 group ${dimmed ? 'opacity-60 grayscale-[0.4]' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
          <h3 className="font-bold text-lg group-hover:text-blue-300 transition-colors truncate">{project.name}</h3>
          {project.key && (
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 flex-shrink-0">
              {project.key}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {project.pinnedZone && (
            <button
              type="button"
              title={t('projectZone.pinnedTooltip')}
              aria-label={t('projectZone.pinnedAria')}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onUnpin(project.id);
              }}
              className="text-sm leading-none hover:scale-110 transition-transform"
            >
              📌
            </button>
          )}
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="text-muted hover:text-fg transition-colors"
              title="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Deadline indicator */}
      <div className="mb-3">
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${zoneMeta.pill}`}>
          {deadlineText()}
        </span>
      </div>

      {project.description && <p className="text-sm text-muted mb-3 line-clamp-2">{project.description}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        {canEditStatus(project.role) ? (
          <select
            value={project.status}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(project.id, { status: e.target.value as ProjectStatus });
            }}
            className={`text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer focus:outline-none ${meta.classes}`}
            title={t('projectStatus.change')}
          >
            <option value="ACTIVE">{`${STATUS_META.ACTIVE.icon} ${t(STATUS_META.ACTIVE.key)}`}</option>
            <option value="ON_HOLD">{`${STATUS_META.ON_HOLD.icon} ${t(STATUS_META.ON_HOLD.key)}`}</option>
            <option value="ARCHIVED">{`${STATUS_META.ARCHIVED.icon} ${t(STATUS_META.ARCHIVED.key)}`}</option>
          </select>
        ) : (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${meta.classes}`}>
            {meta.icon} {t(meta.key)}
          </span>
        )}
        <span className="text-xs text-muted bg-slate-700/60 px-2.5 py-1 rounded-full">
          {project.taskCount} {t('projects.taskCount')}
        </span>
        {typeof project.memberCount === 'number' && (
          <span className="text-xs text-muted bg-slate-700/60 px-2.5 py-1 rounded-full">
            {project.memberCount} {t('members.memberCount')}
          </span>
        )}
        {project.role && (
          <span className="text-xs text-blue-400 bg-blue-600/15 px-2.5 py-1 rounded-full">
            {t(`members.role${project.role.charAt(0) + project.role.slice(1).toLowerCase()}`)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Sortable wrapper: drag listeners + click-to-navigate (drag is suppressed past the activation distance). */
function SortableProjectCard({
  project,
  t,
  onNavigate,
  onStatusChange,
  onUnpin,
}: {
  project: Project;
  t: Translate;
  onNavigate: (id: string) => void;
  onStatusChange: (id: string, data: UpdateProjectData) => void;
  onUnpin: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    data: { type: 'project', zone: project.zone },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onNavigate(project.id)}
      className="shrink-0 snap-start cursor-grab active:cursor-grabbing touch-none"
    >
      <ProjectCardBody project={project} t={t} onStatusChange={onStatusChange} onUnpin={onUnpin} />
    </div>
  );
}

/** Droppable zone row; stays a valid drop target even when empty. */
function ProjectZoneRow({
  zone,
  items,
  t,
  onNavigate,
  onStatusChange,
  onUnpin,
}: {
  zone: ProjectZone;
  items: Project[];
  t: Translate;
  onNavigate: (id: string) => void;
  onStatusChange: (id: string, data: UpdateProjectData) => void;
  onUnpin: (id: string) => void;
}) {
  const zoneMeta = ZONE_META[zone];
  const { setNodeRef, isOver } = useDroppable({ id: zone, data: { type: 'zone', zone } });

  return (
    <section>
      {/* Zone header */}
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

      {/* Droppable row — kept mounted even when empty so cards can be dropped in */}
      <SortableContext items={items.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
        {items.length === 0 ? (
          <div
            ref={setNodeRef}
            className={`rounded-2xl border border-dashed px-5 py-6 text-sm text-muted transition-colors ${
              isOver ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700/50'
            }`}
          >
            {t('projectZone.empty')}
          </div>
        ) : (
          <div
            ref={setNodeRef}
            className={`flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x scroll-pl-1 rounded-2xl [scrollbar-width:thin] transition-colors ${
              isOver ? 'bg-blue-500/5' : ''
            }`}
          >
            {items.map((project) => (
              <SortableProjectCard
                key={project.id}
                project={project}
                t={t}
                onNavigate={onNavigate}
                onStatusChange={onStatusChange}
                onUnpin={onUnpin}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </section>
  );
}

export default function ProjectsPage() {
  const t = useT();
  const [filter, setFilter] = useState<StatusFilter>('ACTIVE');
  const { projects, loading, setProjects, createProject, updateProject, reorderZone } = useProjects(
    FILTER_TO_STATUSES[filter],
  );
  const [showAdd, setShowAdd] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const navigate = useNavigate();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Projects grouped by displayed zone, each pre-sorted by zoneOrder.
  const zoneItems = useMemo(() => {
    const map: Record<ProjectZone, Project[]> = { URGENT: [], MEDIUM: [], NORMAL: [], BACKLOG: [] };
    for (const p of projects) (map[p.zone] ?? map.BACKLOG).push(p);
    for (const z of ZONE_ORDER) map[z] = sortByZoneOrder(map[z]);
    return map;
  }, [projects]);

  const activeProject = activeId ? projects.find((p) => p.id === activeId) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const movedId = String(active.id);
    const overId = String(over.id);
    if (movedId === overId) return;

    const moved = projects.find((p) => p.id === movedId);
    if (!moved) return;
    const sourceZone = moved.zone;
    const targetZone: ProjectZone = isZoneId(overId)
      ? overId
      : projects.find((p) => p.id === overId)?.zone ?? sourceZone;

    // New ordered id list for the destination zone after the move.
    const destIds = zoneItems[targetZone].map((p) => p.id).filter((id) => id !== movedId);
    let insertAt = isZoneId(overId) ? destIds.length : destIds.indexOf(overId);
    if (insertAt < 0) insertAt = destIds.length;
    const orderedIds = [...destIds];
    orderedIds.splice(insertAt, 0, movedId);

    const repin = sourceZone !== targetZone;

    // Optimistic local update; the hook refetches to settle.
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === movedId)
          return {
            ...p,
            zone: targetZone,
            pinnedZone: repin ? targetZone : p.pinnedZone,
            zoneOrder: orderedIds.indexOf(p.id),
          };
        if (orderedIds.includes(p.id)) return { ...p, zoneOrder: orderedIds.indexOf(p.id) };
        return p;
      }),
    );

    reorderZone({ movedId, targetZone, orderedIds, repin });
  };

  const handleUnpin = (id: string) => updateProject(id, { pinnedZone: null });
  const handleStatusChange = (id: string, data: UpdateProjectData) => updateProject(id, data);

  return (
    <div className="px-4 pt-5 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('projects.title')}</h1>
          <p className="text-sm text-muted mt-0.5">{projects.length} {t('projects.activeCount')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 rounded-xl bg-input border border-border text-fg text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="ACTIVE">{t('projectStatus.filterActive')}</option>
            <option value="ON_HOLD">{t('projectStatus.filterOnHold')}</option>
            <option value="ARCHIVED">{t('projectStatus.filterArchived')}</option>
            <option value="ALL">{t('projectStatus.filterAll')}</option>
          </select>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-sm font-semibold transition-all duration-200 shadow-lg shadow-green-600/20"
          >
            {t('projects.addProject')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface flex items-center justify-center">
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <p className="text-muted mb-2">{t('projects.noProjects')}</p>
          <p className="text-sm text-muted">{t('projects.noProjectsHint')}</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex flex-col gap-7">
            {ZONE_ORDER.map((zone) => (
              <ProjectZoneRow
                key={zone}
                zone={zone}
                items={zoneItems[zone]}
                t={t}
                onNavigate={(id) => navigate(`/projects/${id}`)}
                onStatusChange={handleStatusChange}
                onUnpin={handleUnpin}
              />
            ))}
          </div>

          <DragOverlay>
            {activeProject ? (
              <div className="rotate-1">
                <ProjectCardBody
                  project={activeProject}
                  t={t}
                  onStatusChange={handleStatusChange}
                  onUnpin={handleUnpin}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {showAdd && <AddProjectModal onClose={() => setShowAdd(false)} onSubmit={createProject} />}
    </div>
  );
}
