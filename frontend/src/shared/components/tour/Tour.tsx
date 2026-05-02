import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface TourStep {
  id: string;
  /** CSS selector for the element to highlight. Optional — if absent, shown centered. */
  target?: string;
  /** Optional path the user must be on. If different, we navigate first. */
  path?: string;
  title: string;
  body: string;
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const TOUR_KEY = 'tour:done';

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Bun venit in Task Manager!',
    body: 'Iti arat in 30 secunde de unde sa pornesti. Poti opri ghidul oricand cu butonul "Sarit".',
    placement: 'center',
  },
  {
    id: 'week',
    path: '/',
    title: 'Saptamana ta',
    body: 'Aici vezi taskurile zilei pe coloane. Click pe + Task ca sa adaugi unul nou. Daca ai un proiect, taskul va aparea cu badge-ul lui colorat.',
    placement: 'center',
  },
  {
    id: 'projects',
    path: '/projects',
    title: 'Proiecte',
    body: 'Grupezi taskuri pe initiative mari (deploy, monitoring etc). Click pe "+ Proiect" sa creezi unul. Cand adaugi un task, il poti asocia aici.',
    placement: 'center',
  },
  {
    id: 'calendar-toolbar',
    path: '/calendar',
    target: '[data-tour="calendar-views"]',
    title: 'Calendar tip Outlook',
    body: 'Comuta intre Zi / Saptamana / Luna. Click pe ora libera pentru un eveniment nou. Modal-ul are tab-uri pentru reminderuri si participanti.',
    placement: 'bottom',
  },
  {
    id: 'calendar-sidebar',
    path: '/calendar',
    title: 'Categorii (calendare)',
    body: 'Bifezi/debifezi calendarele in sidebar ca sa filtrezi ce vezi. Fiecare categorie are culoarea ei — auto-aplicata pe evenimente.',
    placement: 'center',
  },
  {
    id: 'notebook-sketches',
    path: '/notebook',
    title: 'Carnet + schite',
    body: 'Tab-ul "Schite" iti deschide o tabla — scrie cu degetul sau stylus pe tableta/telefon. Bifeaza "Doar stylus" daca ai palm rejection.',
    placement: 'center',
  },
  {
    id: 'profile',
    path: '/profile',
    title: 'Profil & tema',
    body: 'Schimbi tema (Intunecat/Luminos), legi Telegram-ul, setezi PIN-ul de refresh si "Nu deranja". Reminderurile respecta intervalul.',
    placement: 'center',
  },
  {
    id: 'done',
    title: 'Esti gata!',
    body: 'Poti relua ghidul oricand din Profil → "Reia ghidul". Daca pierzi sesiunea (12h), reintri cu cod Telegram sau PIN.',
    placement: 'center',
  },
];

interface Props {
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function Tour({ forceOpen, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [highlight, setHighlight] = useState<DOMRect | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (forceOpen) {
      setStepIdx(0);
      setOpen(true);
      return;
    }
    const done = localStorage.getItem(TOUR_KEY) === '1';
    if (!done && localStorage.getItem('token')) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [forceOpen]);

  const step = STEPS[stepIdx];

  // Navigate to step path if needed
  useEffect(() => {
    if (!open || !step) return;
    if (step.path && location.pathname !== step.path) {
      navigate(step.path);
    }
  }, [open, step, location.pathname, navigate]);

  // Compute highlight rect
  useEffect(() => {
    if (!open || !step?.target) {
      setHighlight(null);
      return;
    }
    const update = () => {
      const el = document.querySelector(step.target!);
      if (el) setHighlight((el as HTMLElement).getBoundingClientRect());
      else setHighlight(null);
    };
    const t = setTimeout(update, 250); // wait for navigation/render
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, step]);

  const finish = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setOpen(false);
    onClose?.();
  };
  const skip = finish;

  const next = () => {
    if (stepIdx >= STEPS.length - 1) finish();
    else setStepIdx((i) => i + 1);
  };
  const prev = () => setStepIdx((i) => Math.max(0, i - 1));

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!highlight || step?.placement === 'center') {
      return {};
    }
    const margin = 12;
    const cardW = 320;
    const cardH = 180;
    let top = highlight.bottom + margin;
    let left = highlight.left;
    if (top + cardH > window.innerHeight - 12) top = highlight.top - cardH - margin;
    if (left + cardW > window.innerWidth - 12) left = window.innerWidth - cardW - 12;
    if (left < 12) left = 12;
    return { top, left, position: 'fixed' };
  }, [highlight, step]);

  if (!open || !step) return null;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Dim layer with optional cutout for the highlighted target */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" onClick={skip}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {highlight && (
              <rect
                x={highlight.left - 6}
                y={highlight.top - 6}
                width={highlight.width + 12}
                height={highlight.height + 12}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
      </svg>

      {/* Card */}
      <div
        className="bg-surface text-fg rounded-xl border border-border shadow-2xl p-4 w-[320px] pointer-events-auto z-[61]"
        style={
          highlight && step.placement !== 'center'
            ? cardStyle
            : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', position: 'fixed' }
        }
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted">Pas {stepIdx + 1} / {STEPS.length}</span>
          <button onClick={skip} className="text-xs text-muted hover:text-fg">Sarit</button>
        </div>
        <h3 className="font-semibold mb-1">{step.title}</h3>
        <p className="text-sm text-muted mb-4">{step.body}</p>
        <div className="flex gap-2 justify-end">
          {stepIdx > 0 && (
            <button onClick={prev} className="px-3 py-1.5 rounded-md border border-border text-sm">Inapoi</button>
          )}
          <button onClick={next} className="bg-blue-600 hover:bg-blue-500 text-white rounded-md px-3 py-1.5 text-sm">
            {stepIdx === STEPS.length - 1 ? 'Gata' : 'Inainte'}
          </button>
        </div>
      </div>
    </div>
  );
}
