import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useT } from '../../../shared/i18n/I18nProvider';
import { usePerformance } from '../hooks/usePerformance';

interface PerformancePanelProps {
  projectId: string;
}

export default function PerformancePanel({ projectId }: PerformancePanelProps) {
  const t = useT();
  const { data, loading } = usePerformance(projectId);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-muted">{t('pm.noPerformance')}</p>
      </div>
    );
  }

  const velocityData = data.sprints.map((s) => ({
    name: s.name,
    [t('pm.committed')]: s.committedPoints,
    [t('pm.completed')]: s.completedPoints,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-fg">{t('pm.performance')}</h2>

      {/* Totals */}
      <div className="flex gap-4 flex-wrap">
        <div className="px-4 py-3 rounded-xl bg-surface border border-border">
          <p className="text-xs text-muted">{t('pm.committed')}</p>
          <p className="text-lg font-bold text-blue-400">{data.totals.totalCommittedPoints}</p>
        </div>
        <div className="px-4 py-3 rounded-xl bg-surface border border-border">
          <p className="text-xs text-muted">{t('pm.completed')}</p>
          <p className="text-lg font-bold text-green-400">{data.totals.totalCompletedPoints}</p>
        </div>
      </div>

      {/* Per-member table */}
      <div>
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">{t('pm.byMember')}</h3>
        {data.perMember.length === 0 ? (
          <p className="text-sm text-muted">{t('pm.noPerformance')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-muted text-left">
                  <th className="px-3 py-2 font-semibold">{t('board.assignee')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{t('pm.completedPoints')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{t('pm.completedTasks')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{t('pm.completionRate')}</th>
                </tr>
              </thead>
              <tbody>
                {data.perMember.map((m) => (
                  <tr key={m.userId} className="border-t border-border">
                    <td className="px-3 py-2 text-fg">{m.username}</td>
                    <td className="px-3 py-2 text-right text-fg">{m.completedPoints}</td>
                    <td className="px-3 py-2 text-right text-fg">{m.completedTasks}</td>
                    <td className="px-3 py-2 text-right text-fg">{Math.round(m.completionRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Velocity chart */}
      <div>
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">{t('pm.velocity')}</h3>
        {velocityData.length === 0 ? (
          <p className="text-sm text-muted">{t('pm.noSprints')}</p>
        ) : (
          <div className="w-full h-72 rounded-xl bg-surface border border-border p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="rgb(var(--color-muted))" />
                <YAxis tick={{ fontSize: 12 }} stroke="rgb(var(--color-muted))" allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgb(var(--color-surface))' }}
                  contentStyle={{
                    background: 'rgb(var(--color-elevated))',
                    border: '1px solid rgb(var(--color-border))',
                    borderRadius: 12,
                    color: 'rgb(var(--color-fg))',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={t('pm.committed')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey={t('pm.completed')} fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
