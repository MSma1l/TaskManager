import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { metricsApi, MyPoints } from '../api/metrics';
import { useT } from '../../../shared/i18n/I18nProvider';

export default function PersonalStatsCard() {
  const t = useT();
  const [data, setData] = useState<MyPoints | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    metricsApi.getMyPoints()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="bg-surface rounded-xl border border-border p-4">
        <div className="h-5 w-40 bg-elevated rounded animate-pulse" />
      </section>
    );
  }

  if (!data) return null;

  const trendIcon = data.trend === 'up' ? '▲' : data.trend === 'down' ? '▼' : '—';
  const trendColor =
    data.trend === 'up' ? 'text-emerald-500'
    : data.trend === 'down' ? 'text-red-500'
    : 'text-muted';

  const chart = data.monthlySeries.map((m) => ({
    name: m.month.slice(5),
    points: m.points,
  }));

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
      <h2 className="font-semibold">{t('userStats.title')}</h2>

      {/* Career story points — big number */}
      <div className="bg-elevated rounded-lg p-4 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted">{t('userStats.career')}</p>
          <p className="text-4xl font-bold leading-none mt-1">{data.careerStoryPoints}</p>
          <p className="text-xs text-muted mt-1">{t('userStats.points')}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">{t('userStats.thisWeek')}</p>
          <p className={`text-lg font-bold ${trendColor}`}>
            {trendIcon} {data.storyPointsThisWeek}
          </p>
          <p className="text-xs text-muted">
            {t('userStats.lastWeek')}: {data.storyPointsLastWeek}
          </p>
        </div>
      </div>

      {/* Tasks finished — month / quarter / year */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('userStats.month')} value={data.tasksFinished.month} />
        <Stat label={t('userStats.quarter')} value={data.tasksFinished.quarter} />
        <Stat label={t('userStats.year')} value={data.tasksFinished.year} />
      </div>
      <p className="text-xs text-muted -mt-2">
        {t('userStats.tasksFinished')}: {data.tasksFinished.total}
      </p>

      {/* 6-month points chart */}
      {chart.some((c) => c.points > 0) && (
        <div>
          <p className="text-xs text-muted mb-2">{t('userStats.last6Months')}</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chart}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="points" fill="#3B82F6" radius={[4, 4, 0, 0]} name={t('userStats.points')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-elevated rounded-lg p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}
