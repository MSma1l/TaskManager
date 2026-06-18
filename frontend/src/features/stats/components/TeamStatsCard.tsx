import { useEffect, useState } from 'react';
import { metricsApi, TeamPoints } from '../api/metrics';
import { projectsApi, Project } from '../../projects/api/projects';
import { useT } from '../../../shared/i18n/I18nProvider';

const inputCls =
  'w-full bg-input text-fg rounded-lg px-3 py-2 border border-border focus:border-blue-500 focus:outline-none';

export default function TeamStatsCard() {
  const t = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [team, setTeam] = useState<TeamPoints | null>(null);
  const [loading, setLoading] = useState(false);

  // Doar proiectele unde am rol de management (ADMIN/OWNER) — endpoint-ul cere ADMIN+.
  useEffect(() => {
    projectsApi.getAll()
      .then((all) => {
        const manageable = all.filter((p) => p.role === 'ADMIN' || p.role === 'OWNER');
        setProjects(manageable);
        if (manageable.length) setProjectId(manageable[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) {
      setTeam(null);
      return;
    }
    setLoading(true);
    metricsApi.getTeamPoints(projectId)
      .then(setTeam)
      .catch(() => setTeam(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (!projects.length) return null;

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold">{t('userStats.teamTitle')}</h2>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={`${inputCls} max-w-[60%]`}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading && <div className="h-5 w-32 bg-elevated rounded animate-pulse" />}

      {!loading && team && (
        <>
          {/* Per-member table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-border">
                  <th className="text-left font-medium py-2">{t('userStats.member')}</th>
                  <th className="text-right font-medium py-2">{t('userStats.points')}</th>
                  <th className="text-right font-medium py-2">{t('userStats.finished')}</th>
                  <th className="text-right font-medium py-2">{t('userStats.completionRate')}</th>
                </tr>
              </thead>
              <tbody>
                {team.perMember.map((m) => (
                  <tr key={m.userId} className="border-b border-border/50">
                    <td className="py-2">{m.username || '—'}</td>
                    <td className="py-2 text-right font-medium">{m.storyPoints}</td>
                    <td className="py-2 text-right">{m.tasksFinished}/{m.assignedTasks}</td>
                    <td className="py-2 text-right">{Math.round(m.completionRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recommendations */}
          {team.recommendations.length > 0 && (
            <div className="bg-elevated rounded-lg p-3">
              <p className="text-xs text-muted mb-2">{t('userStats.recommendations')}</p>
              <ul className="space-y-1.5">
                {team.recommendations.map((r, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-blue-500">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
