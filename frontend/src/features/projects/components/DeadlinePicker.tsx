import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { ProjectPriority } from '../api/projects';
import {
  DeadlineUnit as Unit,
  wholeDaysFromToday,
  offsetToISO,
  isoToInputValue,
  inputValueToISO,
} from './deadlineUtils';

interface DeadlinePickerProps {
  /** Current deadline as ISO string, or null when "în așteptare" (BACKLOG). */
  deadline: string | null;
  /** Manual priority — only relevant when there is no deadline. */
  priority: ProjectPriority | null;
  /** Emits the new (deadline, priority) pair. */
  onChange: (deadline: string | null, priority: ProjectPriority | null) => void;
}

const PRIORITIES: { value: ProjectPriority; classes: string }[] = [
  { value: 'URGENT', classes: 'data-[on=true]:bg-red-500/20 data-[on=true]:text-red-300 data-[on=true]:ring-red-500/50' },
  { value: 'MEDIUM', classes: 'data-[on=true]:bg-amber-500/20 data-[on=true]:text-amber-300 data-[on=true]:ring-amber-500/50' },
  { value: 'NORMAL', classes: 'data-[on=true]:bg-emerald-500/20 data-[on=true]:text-emerald-300 data-[on=true]:ring-emerald-500/50' },
  { value: 'BACKLOG', classes: 'data-[on=true]:bg-violet-500/20 data-[on=true]:text-violet-300 data-[on=true]:ring-violet-500/50' },
];

const PRIORITY_LABEL_KEY: Record<ProjectPriority, string> = {
  URGENT: 'projectZone.urgentLabel',
  MEDIUM: 'projectZone.mediumLabel',
  NORMAL: 'projectZone.normalLabel',
  BACKLOG: 'projectZone.backlogLabel',
};

export default function DeadlinePicker({ deadline, priority, onChange }: DeadlinePickerProps) {
  const t = useT();
  const [unit, setUnit] = useState<Unit>('days');

  const hasDeadline = !!deadline;
  const derivedDays = deadline ? wholeDaysFromToday(deadline) : null;
  const qtyValue =
    derivedDays == null ? '' : String(unit === 'weeks' ? Math.max(0, Math.round(derivedDays / 7)) : derivedDays);

  const handleQty = (raw: string) => {
    if (raw.trim() === '') return; // empty keeps current value, avoids clobbering
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) return;
    // Setting a deadline clears the manual priority (deadline wins server-side).
    onChange(offsetToISO(n, unit), null);
  };

  const handleUnit = (u: Unit) => {
    setUnit(u);
    if (derivedDays != null) {
      const qty = u === 'weeks' ? Math.max(0, Math.round(derivedDays / 7)) : derivedDays;
      onChange(offsetToISO(qty, u), null);
    }
  };

  const handleDate = (val: string) => {
    const iso = inputValueToISO(val);
    onChange(iso, iso ? null : priority);
  };

  const handleWaiting = () => {
    onChange(null, priority ?? 'BACKLOG');
  };

  const handlePriority = (p: ProjectPriority) => {
    // Picking a priority does not clear an existing deadline; it just records the
    // manual zone the project falls back to once the deadline is removed.
    onChange(deadline, p);
  };

  const resultLabel = deadline
    ? new Date(deadline).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="rounded-xl border border-border bg-input/40 p-3 flex flex-col gap-3">
      <span className="text-sm font-semibold text-fg/90">{t('projects.deadlineSection')}</span>

      {/* Quick-set: number + unit toggle */}
      <div>
        <label className="text-xs text-muted mb-1 block">{t('projects.deadlineQuick')}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={qtyValue}
            onChange={(e) => handleQty(e.target.value)}
            placeholder="0"
            className="w-20 px-3 py-2 rounded-lg bg-input border border-border outline-none focus:border-blue-500 transition-colors text-fg"
          />
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['days', 'weeks'] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => handleUnit(u)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  unit === u ? 'bg-blue-600 text-white' : 'bg-input text-muted hover:text-fg'
                }`}
              >
                {u === 'days' ? t('projects.unitDays') : t('projects.unitWeeks')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Exact date */}
      <div>
        <label className="text-xs text-muted mb-1 block">{t('projects.deadlineDate')}</label>
        <input
          type="date"
          value={isoToInputValue(deadline)}
          onChange={(e) => handleDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-input border border-border outline-none focus:border-blue-500 transition-colors text-fg [color-scheme:dark]"
        />
        {resultLabel && (
          <p className="text-xs text-muted mt-1">
            {t('projects.deadlineResult')}: <span className="text-fg/90 font-medium">{resultLabel}</span>
          </p>
        )}
      </div>

      {/* Waiting / no deadline */}
      <button
        type="button"
        onClick={handleWaiting}
        className={`self-start px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
          hasDeadline
            ? 'border-border bg-input text-muted hover:text-fg'
            : 'border-violet-500/50 bg-violet-500/15 text-violet-300'
        }`}
        title={t('projects.waitingHint')}
      >
        ⏸ {t('projects.waiting')}
      </button>

      {/* Priority (only meaningful when no deadline) */}
      <div className={hasDeadline ? 'opacity-50' : ''}>
        <label className="text-xs text-muted mb-1 block">{t('projects.priorityLabel')}</label>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              data-on={priority === p.value}
              onClick={() => handlePriority(p.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-border text-muted transition-colors ${p.classes}`}
            >
              {t(PRIORITY_LABEL_KEY[p.value])}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-1">{t('projects.priorityHint')}</p>
      </div>
    </div>
  );
}
