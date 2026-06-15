import { useEffect, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';

const TOUR_KEY = 'board_tour_seen';

interface BoardTourProps {
  /** When true, force-open the tour (e.g. from the toolbar "?" button). */
  open: boolean;
  /** Team lead — controls whether the Approve step is shown. */
  canApprove: boolean;
  onClose: () => void;
}

/**
 * Lightweight, self-contained coachmark tour for the board.
 * Renders a dimmed overlay + a centered tooltip carousel. The steps explain the
 * Backlog → Planned → In Progress → Done → Approved workflow.
 * Shown automatically on first visit; re-openable via `open`.
 */
export default function BoardTour({ open, canApprove, onClose }: BoardTourProps) {
  const t = useT();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);

  // Auto-open on first board visit.
  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY)) return;
    if (!localStorage.getItem('token')) return;
    const timer = setTimeout(() => {
      setIdx(0);
      setActive(true);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // External open (toolbar button).
  useEffect(() => {
    if (open) {
      setIdx(0);
      setActive(true);
    }
  }, [open]);

  const steps = [
    { title: t('board.tourMembersTitle'), body: t('board.tourMembersBody') },
    { title: t('board.tourPlanTitle'), body: t('board.tourPlanBody') },
    { title: t('board.tourStartTitle'), body: t('board.tourStartBody') },
    { title: t('board.tourDoneTitle'), body: t('board.tourDoneBody') },
    ...(canApprove
      ? [{ title: t('board.tourApproveTitle'), body: t('board.tourApproveBody') }]
      : []),
    { title: t('board.tourColumnTitle'), body: t('board.tourColumnBody') },
  ];

  const finish = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setActive(false);
    onClose();
  };

  if (!active) return null;

  const step = steps[idx];
  const isLast = idx >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Dim layer */}
      <div className="absolute inset-0 bg-black/60" onClick={finish} />

      {/* Tooltip card */}
      <div className="relative bg-surface text-fg rounded-2xl border border-border shadow-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted">
            {t('board.tourStep')} {idx + 1} / {steps.length}
          </span>
          <button onClick={finish} className="text-xs text-muted hover:text-fg transition-colors">
            {t('board.tourSkip')}
          </button>
        </div>
        <h3 className="font-bold text-lg mb-1.5">{step.title}</h3>
        <p className="text-sm text-muted mb-5 leading-relaxed">{step.body}</p>

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? 'w-5 bg-blue-500' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          {idx > 0 && (
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              className="px-3 py-1.5 rounded-lg border border-border text-sm text-fg hover:bg-elevated transition-colors"
            >
              {t('board.tourBack')}
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setIdx((i) => i + 1))}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            {isLast ? t('board.tourDoneBtn') : t('board.tourNext')}
          </button>
        </div>
      </div>
    </div>
  );
}
