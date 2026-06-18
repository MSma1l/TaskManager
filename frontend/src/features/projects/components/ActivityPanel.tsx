import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../../shared/i18n/I18nProvider';
import { relativeTime } from '../../../shared/utils/dates';
import {
  ActivitySort,
  ProjectActivity,
  ProjectActivityOptions,
  activityApi,
} from '../api/activity';
import { ProjectMember, membersApi } from '../api/members';
import { activityLine } from './activityText';

interface ActivityPanelProps {
  projectId: string;
}

/** Type (action) filter options. Empty value = all. */
const TYPE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'activityFilter.allTypes' },
  { value: 'CREATED', labelKey: 'activityFilter.typeCreated' },
  { value: 'COMMENTED', labelKey: 'activityFilter.typeCommented' },
  { value: 'STATUS_CHANGE', labelKey: 'activityFilter.typeStatus' },
  { value: 'SPRINT_CLOSED', labelKey: 'activityFilter.typeSprintClosed' },
];

const SORT_OPTIONS: { value: ActivitySort; labelKey: string }[] = [
  { value: 'recent', labelKey: 'activityFilter.sortRecent' },
  { value: 'date', labelKey: 'activityFilter.sortDate' },
  { value: 'person', labelKey: 'activityFilter.sortPerson' },
  { value: 'status', labelKey: 'activityFilter.sortStatus' },
  { value: 'priority', labelKey: 'activityFilter.sortPriority' },
];

const SELECT_CLASS =
  'px-3 py-2 rounded-lg bg-input border border-border text-fg text-sm outline-none focus:border-blue-500 transition-colors';

/** Short, human-friendly reference to the task an activity row is about. */
function taskRef(a: ProjectActivity): string | null {
  const key = a.meta && typeof a.meta['taskKey'] === 'string' ? (a.meta['taskKey'] as string) : null;
  if (key) return key;
  if (a.taskId) return `#${a.taskId.slice(-6)}`;
  return null;
}

export default function ActivityPanel({ projectId }: ActivityPanelProps) {
  const { t, lang } = useI18n();

  const [activity, setActivity] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);

  const [actionFilter, setActionFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [sort, setSort] = useState<ActivitySort>('recent');

  // Membrii proiectului pentru dropdown-ul "Persoana".
  useEffect(() => {
    let alive = true;
    membersApi
      .list(projectId)
      .then((m) => alive && setMembers(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  const fetchActivity = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      const opts: ProjectActivityOptions = {
        action: actionFilter || undefined,
        user: personFilter || undefined,
        sort,
      };
      try {
        const data = await activityApi.projectActivity(projectId, 50, opts);
        setActivity(data);
      } catch {
        // ignore — keep last good state
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [projectId, actionFilter, personFilter, sort],
  );

  // Re-fetch on mount + whenever filters/sort change; light polling keeps it fresh.
  useEffect(() => {
    fetchActivity(true);
    const id = setInterval(() => fetchActivity(false), 15000);
    return () => clearInterval(id);
  }, [fetchActivity]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-fg">{t('collab.activityFeed')}</h2>

      {/* Bara de filtre + sortare */}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={t('activityFilter.allTypes')}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>

        <select
          aria-label={t('activityFilter.allPeople')}
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">{t('activityFilter.allPeople')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.fullName || m.username}
            </option>
          ))}
        </select>

        <select
          aria-label={t('activityFilter.sortRecent')}
          value={sort}
          onChange={(e) => setSort(e.target.value as ActivitySort)}
          className={SELECT_CLASS}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {loading && activity.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activity.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">{t('collab.noActivity')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {activity.map((a) => {
            const actor = a.username || t('collab.someone');
            const phrase = activityLine(t, a.action);
            const ref = taskRef(a);
            return (
              <div key={a.id} className="flex gap-2.5 items-start">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg/90">
                    <span className="font-semibold text-fg">{actor}</span> {phrase}
                    {ref && <span className="ml-1 font-mono text-xs text-muted">{ref}</span>}
                  </p>
                  <span className="text-xs text-muted">{relativeTime(a.createdAt, lang)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
