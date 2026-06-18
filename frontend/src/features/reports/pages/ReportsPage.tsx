import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useT } from '../../../shared/i18n/I18nProvider';
import { projectsApi, Project } from '../../projects/api/projects';
import { reportsApi, SprintReport } from '../api/reports';
import ShareReportPanel from '../../viewaccount/components/ShareReportPanel';

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—';
}

export default function ReportsPage() {
  const t = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [reports, setReports] = useState<SprintReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Incarca proiectele userului si selecteaza primul implicit.
  useEffect(() => {
    projectsApi
      .getAll()
      .then((list) => {
        setProjects(list);
        if (list.length > 0) setProjectId(list[0].id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // (Re)incarca rapoartele cand se schimba proiectul selectat.
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    reportsApi
      .list(projectId)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const latest = reports[0] ?? null;

  return (
    <div className="px-4 pt-5 pb-10 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t('nav.reports')}</h1>
        <div className="flex-1" />
        {projects.length > 0 && (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-input border border-border text-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t('report.selectProject')}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !latest || !latest.report ? (
        <div className="text-center py-20">
          <p className="text-muted">{t('report.noReports')}</p>
        </div>
      ) : (
        <>
          {/* Cel mai recent raport */}
          <LatestReport report={latest} />

          {/* Lista rapoartelor anterioare */}
          {reports.length > 1 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-fg mb-3">{t('report.allReports')}</h2>
              <div className="flex flex-col gap-2">
                {reports.slice(1).map((r) => (
                  <div
                    key={r.sprintId}
                    className="rounded-xl bg-surface border border-border p-3 flex items-center gap-3 flex-wrap"
                  >
                    <span className="font-semibold text-fg">{r.name}</span>
                    <span className="text-xs text-muted">{fmtDate(r.closedAt)}</span>
                    <div className="flex-1" />
                    {r.report && (
                      <span className="text-sm text-muted">
                        {r.report.completedTasks}/{r.report.totalTasks} · {r.report.completionPct}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* View Account — linkuri publice read-only */}
      <div className="mt-8">
        <ShareReportPanel />
      </div>
    </div>
  );
}

function LatestReport({ report: r }: { report: SprintReport }) {
  const t = useT();
  const data = r.report!;

  return (
    <div className="rounded-2xl bg-surface border border-border p-5">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
          {t('report.latest')}
        </span>
        <h2 className="text-xl font-bold text-fg">{r.name}</h2>
      </div>
      {r.goal && <p className="text-sm text-muted mb-1">{r.goal}</p>}
      <p className="text-xs text-muted mb-5">
        {fmtDate(r.startDate)} → {fmtDate(r.endDate)} · {t('report.closedAt')} {fmtDate(r.closedAt)}
      </p>

      {/* Statistici sumare */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label={t('report.tasksPlanned')} value={`${data.totalTasks}`} />
        <Stat label={t('report.completed')} value={`${data.completedTasks}`} />
        <Stat label={t('report.completionPct')} value={`${data.completionPct}%`} />
        <Stat label={t('report.totalPoints')} value={`${data.completedPoints}/${data.totalPoints}`} />
      </div>

      {/* Burndown */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
          {t('report.burndown')}
        </h3>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.burndown} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <XAxis dataKey="label" stroke="currentColor" className="text-muted" fontSize={12} />
              <YAxis stroke="currentColor" className="text-muted" fontSize={12} />
              <Tooltip
                contentStyle={{ background: 'var(--color-elevated, #1f2937)', border: '1px solid var(--color-border, #374151)', borderRadius: 8 }}
              />
              <Legend />
              <Line type="monotone" dataKey="ideal" name={t('report.ideal')} stroke="#6B7280" strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="actual" name={t('report.actual')} stroke="#3B82F6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per membru */}
      <div>
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
          {t('report.perMember')}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">{t('report.member')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('report.tasksDone')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('report.pointsDone')}</th>
                <th className="py-2 pl-3 font-medium text-right">{t('report.tasksPending')}</th>
              </tr>
            </thead>
            <tbody>
              {data.perMember.map((m) => (
                <tr key={m.userId} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-fg">{m.username ?? m.userId}</td>
                  <td className="py-2 px-3 text-right text-fg">{m.tasksDone}</td>
                  <td className="py-2 px-3 text-right text-fg">{m.storyPointsDone}</td>
                  <td className="py-2 pl-3 text-right text-muted">{m.tasksPending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-elevated border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-bold text-fg mt-0.5">{value}</p>
    </div>
  );
}
