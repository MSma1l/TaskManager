import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useT } from '../../../shared/i18n/I18nProvider';
import {
  getPublicReport,
  PublicReport,
  PublicProject,
  PublicReportMember,
  CompletedSprintReport,
} from '../api/viewaccount';

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—';
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-500/15 text-green-500',
  ON_HOLD: 'bg-amber-500/15 text-amber-500',
  ARCHIVED: 'bg-slate-500/15 text-slate-400',
};

function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const cls = STATUS_STYLES[status] ?? 'bg-slate-500/15 text-slate-400';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {t(`viewAccount.status.${status}`)}
    </span>
  );
}

export default function PublicReportPage() {
  const t = useT();
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<PublicReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    getPublicReport(token)
      .then((data) => {
        setReport(data);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-fg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-bg text-fg flex items-center justify-center px-4">
        <div className="bg-surface border border-border rounded-2xl p-8 text-center max-w-md">
          <h1 className="text-xl font-bold mb-2">{t('viewAccount.notFoundTitle')}</h1>
          <p className="text-muted text-sm">{t('viewAccount.notFoundBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Banda "view-only" sticky */}
      <div className="sticky top-0 z-10 bg-elevated/95 backdrop-blur border-b border-border">
        <div className="max-w-[1100px] mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-bold tracking-tight">
            {report.label || t('viewAccount.title')}
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 text-blue-400 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
            {t('viewAccount.readOnlyBadge')}
          </span>
          <div className="flex-1" />
          <span className="text-xs text-muted">
            {t('viewAccount.generatedAt')} {fmtDate(report.generatedAt)}
          </span>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 py-6 flex flex-col gap-8">
        {/* Productivitate echipa (agregat global) */}
        {report.teamMemberProductivity.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
              {t('viewAccount.teamProductivity')}
            </h2>
            <MemberTable members={report.teamMemberProductivity} />
          </section>
        )}

        {/* Proiecte */}
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            {t('viewAccount.projects')}
          </h2>
          {report.projects.length === 0 ? (
            <p className="text-muted text-sm">{t('viewAccount.noProjects')}</p>
          ) : (
            <div className="flex flex-col gap-6">
              {report.projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </section>

        <p className="text-center text-xs text-muted pt-4 pb-8">
          {t('viewAccount.footer')}
        </p>
      </div>
    </div>
  );
}

function ProjectCard({ project: p }: { project: PublicProject }) {
  const t = useT();
  const latest: CompletedSprintReport | null =
    p.sprintReports.find((r) => r.report) ?? null;

  return (
    <div className="rounded-2xl bg-surface border border-border p-5">
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ background: p.color || '#3b82f6' }}
        />
        <h3 className="text-lg font-bold text-fg">{p.name}</h3>
        <StatusBadge status={p.status} />
      </div>

      {/* Sumar proiect */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label={t('viewAccount.completedSprints')} value={`${p.completedSprintCount}`} />
        <Stat label={t('viewAccount.activeSprints')} value={`${p.activeSprintCount}`} />
        <Stat label={t('viewAccount.tasksDone')} value={`${p.totalCompletedTasks}`} />
        <Stat label={t('viewAccount.pointsDone')} value={`${p.totalCompletedPoints}`} />
      </div>

      {/* Sprinturi active (live) */}
      {p.activeSprints.length > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            {t('viewAccount.activeSprintPerformance')}
          </h4>
          <div className="flex flex-col gap-2">
            {p.activeSprints.map((s) => (
              <div
                key={s.sprintId}
                className="rounded-xl bg-elevated border border-border p-3 flex items-center gap-3 flex-wrap"
              >
                <span className="font-semibold text-fg">{s.name}</span>
                <div className="flex-1" />
                <span className="text-sm text-muted">
                  {s.completedTasks}/{s.totalTasks} · {s.completionPct}% · {s.completedPoints}/{s.totalPoints} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Burndown din cel mai recent sprint inchis */}
      {latest?.report && latest.report.burndown?.length > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            {t('viewAccount.burndown')} · {latest.name}
          </h4>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={latest.report.burndown} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" stroke="currentColor" className="text-muted" fontSize={12} />
                <YAxis stroke="currentColor" className="text-muted" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-elevated, #1f2937)', border: '1px solid var(--color-border, #374151)', borderRadius: 8 }}
                />
                <Legend />
                <Line type="monotone" dataKey="ideal" name={t('viewAccount.ideal')} stroke="#6B7280" strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="actual" name={t('viewAccount.actual')} stroke="#3B82F6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Productivitate membri pe proiect */}
      {p.memberProductivity.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            {t('viewAccount.memberProductivity')}
          </h4>
          <MemberTable members={p.memberProductivity} />
        </div>
      )}
    </div>
  );
}

function MemberTable({ members }: { members: PublicReportMember[] }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            <th className="py-2 pr-3 font-medium">{t('viewAccount.member')}</th>
            <th className="py-2 px-3 font-medium text-right">{t('viewAccount.tasksDone')}</th>
            <th className="py-2 px-3 font-medium text-right">{t('viewAccount.pointsDone')}</th>
            <th className="py-2 pl-3 font-medium text-right">{t('viewAccount.tasksPending')}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
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
