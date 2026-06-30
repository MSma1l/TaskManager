import { ProjectZone } from '../api/projects';

type Translate = (key: string) => string;

export interface ZoneMeta {
  labelKey: string;
  subtitleKey: string;
  icon: string;
  /** Left accent bar + header icon chip background. */
  accent: string;
  /** Header title text color. */
  headerText: string;
  /** Count badge classes. */
  badge: string;
  /** Deadline pill on each card. */
  pill: string;
  /** Card hover ring tint. */
  cardHover: string;
}

/**
 * Per-zone presentation. Colors are semantic-by-design (zone = urgency), so we
 * use explicit Tailwind palette classes instead of theme tokens:
 *   URGENT = red, MEDIUM = amber, NORMAL = emerald, BACKLOG = violet.
 * Shared by ProjectsPage (project zones) and the task-level zone views.
 */
export const ZONE_META: Record<ProjectZone, ZoneMeta> = {
  URGENT: {
    labelKey: 'projectZone.urgentLabel',
    subtitleKey: 'projectZone.urgentSubtitle',
    icon: '🔥',
    accent: 'bg-red-500',
    headerText: 'text-red-300',
    badge: 'bg-red-500/20 text-red-300',
    pill: 'bg-red-500/15 text-red-300',
    cardHover: 'hover:border-red-500/40',
  },
  MEDIUM: {
    labelKey: 'projectZone.mediumLabel',
    subtitleKey: 'projectZone.mediumSubtitle',
    icon: '⚡',
    accent: 'bg-amber-500',
    headerText: 'text-amber-300',
    badge: 'bg-amber-500/20 text-amber-300',
    pill: 'bg-amber-500/15 text-amber-300',
    cardHover: 'hover:border-amber-500/40',
  },
  NORMAL: {
    labelKey: 'projectZone.normalLabel',
    subtitleKey: 'projectZone.normalSubtitle',
    icon: '🌱',
    accent: 'bg-emerald-500',
    headerText: 'text-emerald-300',
    badge: 'bg-emerald-500/20 text-emerald-300',
    pill: 'bg-emerald-500/15 text-emerald-300',
    cardHover: 'hover:border-emerald-500/40',
  },
  BACKLOG: {
    labelKey: 'projectZone.backlogLabel',
    subtitleKey: 'projectZone.backlogSubtitle',
    icon: '💡',
    accent: 'bg-violet-500',
    headerText: 'text-violet-300',
    badge: 'bg-violet-500/20 text-violet-300',
    pill: 'bg-violet-500/15 text-violet-300',
    cardHover: 'hover:border-violet-500/40',
  },
};

export const ZONE_ORDER: ProjectZone[] = ['URGENT', 'MEDIUM', 'NORMAL', 'BACKLOG'];

/**
 * Short deadline pill text. Reuses the shared `projects.deadline*` strings
 * (RO: "⏳ N zile" / "⏳ azi" / "⚠️ depășit Nz" / "— fără termen").
 * `dueDate` disambiguates the "no termen" case when `daysRemaining` is null.
 */
export function deadlinePillText(
  t: Translate,
  daysRemaining: number | null,
  dueDate: string | null,
): string {
  if (daysRemaining === null || !dueDate) return t('projects.deadlineNone');
  if (daysRemaining < 0) return t('projects.deadlineOverdue').replace('{n}', String(Math.abs(daysRemaining)));
  if (daysRemaining === 0) return t('projects.deadlineToday');
  return t('projects.deadlineDays').replace('{n}', String(daysRemaining));
}

/** Human duration, e.g. `2h 05m` or `4m 30s`. Always rounds down to whole seconds. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}
