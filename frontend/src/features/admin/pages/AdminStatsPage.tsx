import { useEffect, useState } from 'react';
import { adminApi, StatsOverview, UserStatRow } from '../api/admin';

const WINDOWS = [
  { days: 7, label: '7 zile' },
  { days: 14, label: '2 sapt' },
  { days: 30, label: '30 zile' },
  { days: 90, label: '90 zile' },
];

export default function AdminStatsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminApi.statsOverview(days)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e?.response?.data?.detail || 'Eroare incarcare statistici'))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Statistici per utilizator</h2>
          <p className="text-slate-400 text-sm">Reusite taskuri + sedinte participate</p>
        </div>
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                days === w.days ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading && <p className="text-slate-400 text-sm">Se incarca…</p>}

      {data && (
        <div className="space-y-2">
          {data.users.map((row) => (
            <UserStatsCard key={row.user.id} row={row} />
          ))}
          {data.users.length === 0 && (
            <p className="text-slate-400 text-sm">Niciun utilizator activ.</p>
          )}
        </div>
      )}
    </div>
  );
}

function UserStatsCard({ row }: { row: UserStatRow }) {
  const t = row.tasks;
  const m = row.meetings;
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${row.user.role === 'ADMIN' ? 'bg-red-500' : 'bg-blue-500'}`} />
          <div>
            <p className="font-semibold">{row.user.username}</p>
            <p className="text-xs text-slate-400">{row.user.fullName || ''} · {row.user.role}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${row.user.telegramChatId ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
          {row.user.telegramChatId ? 'Telegram legat' : 'Telegram nelegat'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Block
          title="Taskuri"
          percent={t.donePercent || 0}
          subtitle={`${t.done || 0} facute / ${t.total || 0} total`}
          extra={`Pending: ${t.pending || 0} · Mutate: ${t.skipped || 0} · Nefacute: ${t.notDone || 0}`}
        />
        <Block
          title="Sedinte"
          percent={m.attendedPercent || 0}
          subtitle={`${m.attended || 0} confirmate / ${m.past || 0} trecute`}
          extra={`Cu nota: ${m.withNote || 0} · Viitoare: ${m.upcoming || 0} · Total: ${m.total || 0}`}
        />
      </div>
    </div>
  );
}

function Block({ title, percent, subtitle, extra }: { title: string; percent: number; subtitle: string; extra: string }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/40">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-slate-400">{title}</span>
        <span className="text-2xl font-bold">{percent}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full ${percent >= 70 ? 'bg-emerald-500' : percent >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className="text-sm">{subtitle}</p>
      <p className="text-xs text-slate-500 mt-0.5">{extra}</p>
    </div>
  );
}
