import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { statsApi, WeeklyStats, WeekHistory, TaskStreak, MissedTask } from '../api/stats';
import ProgressBar from '../../../shared/components/ui/ProgressBar';

const PIE_COLORS = ['#10B981', '#3B82F6', '#EF4444', '#6B7280'];

export default function StatsPage() {
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [history, setHistory] = useState<WeekHistory[]>([]);
  const [streaks, setStreaks] = useState<TaskStreak[]>([]);
  const [missed, setMissed] = useState<MissedTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      statsApi.getWeekly(),
      statsApi.getHistory(),
      statsApi.getStreaks(),
      statsApi.getMissed(),
    ])
      .then(([s, h, st, m]) => {
        setStats(s);
        setHistory(h);
        setStreaks(st);
        setMissed(m);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pieData = stats
    ? [
        { name: 'Done', value: stats.done },
        { name: 'Skipped', value: stats.skipped },
        { name: 'Not Done', value: stats.notDone },
        { name: 'Pending', value: Math.max(0, stats.total - stats.done - stats.skipped - stats.notDone) },
      ].filter((d) => d.value > 0)
    : [];

  const historyChart = history.map((h) => ({
    name: h.weekStart.slice(5, 10),
    percentage: h.percentage,
    done: h.done,
    total: h.total,
  }));

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="text-xl font-bold mb-6">Statistici</h1>

      {/* Current week progress */}
      {stats && (
        <div className="bg-slate-800 rounded-xl p-5 mb-6 border border-slate-700">
          <h2 className="text-sm text-slate-400 mb-3">Saptamana curenta</h2>
          <div className="flex items-center gap-6">
            {/* Progress ring */}
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#334155" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40" fill="none" stroke="#3B82F6" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${stats.percentage * 2.51} 251`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold">{Math.round(stats.percentage)}%</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total</span>
                <span>{stats.total}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-400">Completate</span>
                <span>{stats.done}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-400">Mutate</span>
                <span>{stats.skipped}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-red-400">Nefacute</span>
                <span>{stats.notDone}</span>
              </div>
              <ProgressBar percentage={stats.percentage} />
            </div>
          </div>
        </div>
      )}

      {/* History bar chart */}
      {historyChart.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5 mb-6 border border-slate-700">
          <h2 className="text-sm text-slate-400 mb-3">Ultimele 8 saptamani</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={historyChart}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="percentage" fill="#3B82F6" radius={[4, 4, 0, 0]} name="%" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pie chart */}
      {pieData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5 mb-6 border border-slate-700">
          <h2 className="text-sm text-slate-400 mb-3">Distributie status</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Streaks */}
      {streaks.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5 mb-6 border border-slate-700">
          <h2 className="text-sm text-slate-400 mb-3">Streak-uri</h2>
          <div className="space-y-3">
            {streaks.slice(0, 5).map((s) => (
              <div key={s.taskId} className="flex items-center justify-between">
                <span className="text-sm">{s.taskTitle}</span>
                <span className="text-sm font-bold text-orange-400">
                  {s.streak} sapt.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missed */}
      {missed.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-sm text-slate-400 mb-3">Top taskuri ratate</h2>
          <div className="space-y-3">
            {missed.map((m) => (
              <div key={m.taskId} className="flex items-center justify-between">
                <span className="text-sm">{m.taskTitle}</span>
                <span className="text-sm font-bold text-red-400">{m.missedCount}x ratat</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
