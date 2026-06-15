import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { TransitionData } from '../api/board';

interface PlanTaskModalProps {
  /** Title of the task being planned (for the header). */
  taskTitle: string;
  taskKey?: string | null;
  /** Pre-filled values when re-planning. */
  initialEstimateMinutes?: number | null;
  initialDayOfWeek?: number | null;
  onClose: () => void;
  /** Submit handler — receives a ready-to-send transition payload (action='plan'). */
  onSubmit: (data: TransitionData) => Promise<unknown>;
}

/** 0 = Monday … 6 = Sunday (matches the weekly grid convention). */
const DOW_KEYS = [
  'board.dowMon',
  'board.dowTue',
  'board.dowWed',
  'board.dowThu',
  'board.dowFri',
  'board.dowSat',
  'board.dowSun',
];

export default function PlanTaskModal({
  taskTitle,
  taskKey,
  initialEstimateMinutes,
  initialDayOfWeek,
  onClose,
  onSubmit,
}: PlanTaskModalProps) {
  const t = useT();
  const [hours, setHours] = useState(
    initialEstimateMinutes != null ? String(Math.floor(initialEstimateMinutes / 60)) : '',
  );
  const [minutes, setMinutes] = useState(
    initialEstimateMinutes != null ? String(initialEstimateMinutes % 60) : '',
  );
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(
    initialDayOfWeek != null ? initialDayOfWeek : null,
  );
  const [reminderTime, setReminderTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const estimateMinutes = h * 60 + m;

    setError('');
    setLoading(true);
    try {
      const payload: TransitionData = { action: 'plan' };
      if (estimateMinutes > 0) payload.estimateMinutes = estimateMinutes;
      if (dayOfWeek != null) payload.dayOfWeek = dayOfWeek;
      if (reminderTime) payload.reminderTime = reminderTime;
      await onSubmit(payload);
      onClose();
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-elevated rounded-2xl p-6 w-full max-w-sm border border-border"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-1 text-fg">{t('board.planTask')}</h3>
        <p className="text-sm text-muted mb-4 truncate">
          {taskKey ? <span className="font-mono text-blue-400">{taskKey}</span> : null} {taskTitle}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {/* Estimate */}
          <div>
            <label className="text-sm text-fg mb-1.5 block">{t('board.estimate')}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0"
                className="w-16 px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors text-center"
              />
              <span className="text-sm text-muted">{t('board.hoursShort')}</span>
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="0"
                className="w-16 px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors text-center"
              />
              <span className="text-sm text-muted">{t('board.minutesShort')}</span>
            </div>
          </div>

          {/* Day of week */}
          <div>
            <label className="text-sm text-fg mb-1.5 block">{t('board.when')}</label>
            <div className="grid grid-cols-4 gap-1.5">
              {DOW_KEYS.map((key, idx) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDayOfWeek((cur) => (cur === idx ? null : idx))}
                  className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    dayOfWeek === idx
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-surface border-border text-muted hover:text-fg'
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {/* Reminder */}
          <div>
            <label className="text-sm text-fg mb-1.5 block">{t('board.reminderTime')}</label>
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="flex gap-3 mt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-blue-600/20"
            >
              {loading ? t('common.saving') : t('board.plan')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
