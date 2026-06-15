import { useI18n } from '../../../shared/i18n/I18nProvider';
import { relativeTime } from '../../../shared/utils/dates';
import { ProjectActivity } from '../api/activity';
import { useProjectActivity } from '../hooks/useProjectActivity';
import { activityLine } from './activityText';

interface ActivityPanelProps {
  projectId: string;
}

/** Short, human-friendly reference to the task an activity row is about. */
function taskRef(a: ProjectActivity): string | null {
  const key = a.meta && typeof a.meta['taskKey'] === 'string' ? (a.meta['taskKey'] as string) : null;
  if (key) return key;
  if (a.taskId) return `#${a.taskId.slice(-6)}`;
  return null;
}

export default function ActivityPanel({ projectId }: ActivityPanelProps) {
  const { t, lang } = useI18n();
  const { activity, loading } = useProjectActivity(projectId);

  if (loading && activity.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-fg">{t('collab.activityFeed')}</h2>

      {activity.length === 0 ? (
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
                    {ref && (
                      <span className="ml-1 font-mono text-xs text-muted">{ref}</span>
                    )}
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
