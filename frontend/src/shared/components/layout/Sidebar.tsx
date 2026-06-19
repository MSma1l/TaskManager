import { NavLink } from 'react-router-dom';
import { useT } from '../../i18n/I18nProvider';
import { useQuickTaskCount } from '../../../features/quicktasks/hooks/useQuickTaskCount';

interface NavItem {
  to: string;
  labelKey: string;
  icon: JSX.Element;
  end?: boolean;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const I = {
  calendar: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  folder: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  bolt: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  book: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  chart: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  user: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  inbox: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  ),
};

/**
 * Sidebar de navigare (desktop). Grupat in sectiunile Work / Stats conform
 * specificatiei. Pe mobil ramane BottomNav-ul (sidebar-ul e `hidden md:flex`).
 *
 * NOTE: itemele Quick Tasks / Verificare / Rapoarte sunt afisate doar daca
 * ruta exista deja — se adauga aici pe masura ce feature-urile aterizeaza.
 */
const SECTIONS: NavSection[] = [
  {
    titleKey: 'nav.sectionWork',
    items: [
      { to: '/', end: true, labelKey: 'nav.weekly', icon: I.calendar },
      { to: '/today', labelKey: 'nav.task', icon: I.check },
      { to: '/projects', labelKey: 'nav.projects', icon: I.folder },
      { to: '/quick-tasks', labelKey: 'nav.quickTasks', icon: I.bolt },
      { to: '/verify', labelKey: 'nav.verify', icon: I.inbox },
      { to: '/calendar', labelKey: 'nav.calendar', icon: I.calendar },
      { to: '/notebook', labelKey: 'nav.notebook', icon: I.book },
    ],
  },
  {
    titleKey: 'nav.sectionStats',
    items: [
      { to: '/stats', labelKey: 'nav.dashboard', icon: I.chart },
      { to: '/reports', labelKey: 'nav.reports', icon: I.chart },
      { to: '/profile', labelKey: 'nav.profile', icon: I.user },
    ],
  },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
    isActive
      ? 'bg-blue-500/10 text-blue-400 font-semibold'
      : 'text-muted hover:text-fg hover:bg-elevated/60'
  }`;

export default function Sidebar() {
  const t = useT();
  const quickCount = useQuickTaskCount();
  return (
    <aside
      className="hidden md:flex fixed top-0 left-0 bottom-0 z-40 w-60 flex-col border-r border-border bg-surface/80 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="px-5 py-5">
        <h1 className="text-lg font-bold tracking-tight text-fg">Task Manager</h1>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6 flex flex-col gap-5">
        {SECTIONS.map((section) => (
          <div key={section.titleKey} className="flex flex-col gap-1">
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
              {t(section.titleKey)}
            </p>
            {section.items.map((item) => {
              const badge = item.to === '/quick-tasks' ? quickCount : 0;
              return (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="flex-1">{t(item.labelKey)}</span>
                  {badge > 0 && (
                    <span className="flex-shrink-0 min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
