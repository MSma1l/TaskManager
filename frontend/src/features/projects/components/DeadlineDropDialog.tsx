import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { ProjectZone } from '../api/projects';
import { ZONE_META } from './zoneMeta';
import {
  DeadlineUnit as Unit,
  wholeDaysFromToday,
  offsetToISO,
  isoToInputValue,
  inputValueToISO,
} from './deadlineUtils';

interface DeadlineDropDialogProps {
  /** Target zone the card was dropped into (URGENT / MEDIUM / NORMAL). */
  zone: ProjectZone;
  /** Pre-filled suggested deadline ISO for the zone. */
  suggestedIso: string;
  /** Primary "Pune termen" — confirm with the chosen ISO. */
  onSetDeadline: (iso: string) => void;
  /** Secondary "Doar fixează" — pin to the zone without a deadline. */
  onPinOnly: () => void;
  /** Cancel — revert the optimistic move. Also fired on overlay click. */
  onCancel: () => void;
}

/**
 * Small modal shown after a cross-zone drop into URGENT / MEDIUM / NORMAL.
 * Lets the user pick a real deadline (which makes the card land in the zone
 * naturally) or just pin it to the zone with no deadline.
 */
export default function DeadlineDropDialog({
  zone,
  suggestedIso,
  onSetDeadline,
  onPinOnly,
  onCancel,
}: DeadlineDropDialogProps) {
  const t = useT();
  const meta = ZONE_META[zone];
  const [iso, setIso] = useState<string>(suggestedIso);
  const [unit, setUnit] = useState<Unit>('days');

  const derivedDays = wholeDaysFromToday(iso);
  const qtyValue = String(unit === 'weeks' ? Math.max(0, Math.round(derivedDays / 7)) : derivedDays);

  const handleQty = (raw: string) => {
    if (raw.trim() === '') return;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) return;
    setIso(offsetToISO(n, unit));
  };

  const handleUnit = (u: Unit) => {
    setUnit(u);
    const qty = u === 'weeks' ? Math.max(0, Math.round(derivedDays / 7)) : derivedDays;
    setIso(offsetToISO(qty, u));
  };

  const handleDate = (val: string) => {
    const next = inputValueToISO(val);
    if (next) setIso(next);
  };

  const resultLabel = new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-2xl p-6 w-full max-w-sm border border-border"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Title — references and is colored by the target zone */}
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-1.5 h-6 rounded-full ${meta.accent}`} />
          <h3 className={`text-lg font-bold ${meta.headerText}`}>
            {t('deadlineDrop.title').replace('{zone}', t(meta.labelKey))}
          </h3>
        </div>
        <p className="text-sm text-muted mb-4">{t('deadlineDrop.prompt')}</p>

        {/* Quick-set: number + unit toggle */}
        <div className="mb-3">
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
        <div className="mb-4">
          <label className="text-xs text-muted mb-1 block">{t('projects.deadlineDate')}</label>
          <input
            type="date"
            value={isoToInputValue(iso)}
            onChange={(e) => handleDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-input border border-border outline-none focus:border-blue-500 transition-colors text-fg [color-scheme:dark]"
          />
          <p className="text-xs text-muted mt-1">
            {t('projects.deadlineResult')}: <span className="text-fg/90 font-medium">{resultLabel}</span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onSetDeadline(iso)}
            className="w-full px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            {t('deadlineDrop.setDeadline')}
          </button>
          <button
            type="button"
            onClick={onPinOnly}
            className="w-full px-4 py-2 rounded-xl bg-input border border-border text-fg text-sm font-medium hover:bg-elevated transition-colors"
          >
            📌 {t('deadlineDrop.pinOnly')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full px-4 py-1.5 rounded-xl text-sm font-medium text-muted hover:text-fg transition-colors"
          >
            {t('deadlineDrop.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
