import { Fragment, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useTimeReport } from '../hooks/useTimeReport';
import { formatDuration } from './zoneMeta';
import { avatarTint } from './boardConstants';

interface TimeReportPanelProps {
  projectId: string;
}

/**
 * Owner-only per-project time report: a total header plus a per-member table.
 * Each member row expands to reveal their tasks and the time spent on each.
 */
export default function TimeReportPanel({ projectId }: TimeReportPanelProps) {
  const t = useT();
  const { data, loading } = useTimeReport(projectId);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || data.members.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted">{t('timeReport.empty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-fg">{t('timeReport.title')}</h2>

      {/* Total */}
      <div className="flex gap-4 flex-wrap">
        <div className="px-4 py-3 rounded-xl bg-surface border border-border">
          <p className="text-xs text-muted">{t('timeReport.total')}</p>
          <p className="text-lg font-bold text-blue-400 tabular-nums">{formatDuration(data.totalSeconds)}</p>
        </div>
      </div>

      {/* Per-member table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface text-muted text-left">
              <th className="px-3 py-2 font-semibold">{t('timeReport.member')}</th>
              <th className="px-3 py-2 font-semibold text-right">{t('timeReport.time')}</th>
              <th className="px-3 py-2 font-semibold text-right">{t('timeReport.taskCount')}</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => {
              const open = expanded === m.userId;
              const name = m.fullName || m.username;
              return (
                <Fragment key={m.userId}>
                  <tr
                    onClick={() => setExpanded(open ? null : m.userId)}
                    className="border-t border-border cursor-pointer hover:bg-surface/60 transition-colors"
                  >
                    <td className="px-3 py-2 text-fg">
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarTint(
                            m.userId,
                          )}`}
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>
                        {name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-fg tabular-nums">{formatDuration(m.totalSeconds)}</td>
                    <td className="px-3 py-2 text-right text-fg">{m.taskCount}</td>
                    <td className="px-3 py-2 text-right text-muted">
                      <svg
                        className={`w-4 h-4 inline transition-transform ${open ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-t border-border bg-bg/40">
                      <td colSpan={4} className="px-3 py-2">
                        {m.tasks.length === 0 ? (
                          <p className="text-xs text-muted">{t('timeReport.empty')}</p>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {m.tasks.map((tk) => (
                              <li key={tk.taskId} className="flex items-center justify-between gap-3 text-xs">
                                <span className="flex items-center gap-1.5 min-w-0">
                                  {tk.taskKey && (
                                    <span className="font-mono font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400">
                                      {tk.taskKey}
                                    </span>
                                  )}
                                  <span className="text-fg/90 truncate">{tk.title}</span>
                                </span>
                                <span className="text-muted tabular-nums flex-shrink-0">
                                  {formatDuration(tk.seconds)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
