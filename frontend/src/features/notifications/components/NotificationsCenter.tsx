import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../../shared/i18n/I18nProvider';
import { relativeTime } from '../../../shared/utils/dates';
import { AppNotification } from '../api/notifications';
import { useNotificationsCenter } from '../hooks/useNotificationsCenter';

const BellIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

/**
 * Centru de notificari reutilizabil. Apare ca o intrare de meniu mai mare in
 * sidebar (desktop) si in bara de jos (mobil); panoul cu lista se ancoreaza
 * jos-stanga, deasupra triggerului. Pastreaza badge-ul de necitite + accent
 * rosu pentru notificarile URGENTE.
 */
export default function NotificationsCenter({ variant }: { variant: 'sidebar' | 'bottomnav' }) {
  const t = useT();
  const navigate = useNavigate();
  const { count, items, loading, loadList, markReadRow, markAll } = useNotificationsCenter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await loadList();
  };

  const onRow = async (n: AppNotification) => {
    await markReadRow(n);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const badge = count > 0 && (
    <span className="flex-shrink-0 min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );

  const panelPos =
    variant === 'sidebar'
      ? 'fixed bottom-4 left-[15.5rem] w-80 max-w-[calc(100vw-16rem)]'
      : 'fixed bottom-[4.75rem] left-2 right-2 max-w-md mx-auto';

  return (
    <div ref={ref} className="contents">
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={t('notifications.title')}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
            open ? 'bg-blue-500/10 text-blue-400 font-semibold' : 'text-muted hover:text-fg hover:bg-elevated/60'
          }`}
        >
          <span className="flex-shrink-0"><BellIcon /></span>
          <span className="flex-1 text-left">{t('nav.notifications')}</span>
          {badge}
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={t('notifications.title')}
          className={`w-full flex flex-col items-center justify-center gap-0.5 py-1.5 mx-0.5 rounded-xl transition-all duration-150 active:scale-95 ${
            open ? 'text-blue-400 bg-blue-500/10 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <span className="relative">
            <BellIcon className="w-6 h-6" />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </span>
          <span className="text-[10px] sm:text-xs leading-none">{t('nav.notifications')}</span>
        </button>
      )}

      {open && (
        <div className={`${panelPos} z-50 bg-elevated border border-border rounded-xl shadow-xl overflow-hidden`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="font-semibold text-sm text-fg">{t('notifications.title')}</span>
            <button onClick={markAll} className="text-xs text-blue-400 hover:text-blue-300">
              {t('notifications.markAllRead')}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted text-center py-6">{t('common.loading')}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">{t('notifications.empty')}</p>
            ) : (
              items.map((n) => {
                const urgent = n.priority === 'URGENT';
                return (
                  <button
                    key={n.id}
                    onClick={() => onRow(n)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/60 hover:bg-surface transition-colors ${
                      urgent ? 'border-l-4 border-l-red-500 bg-red-500/5' : n.isRead ? '' : 'bg-blue-500/5'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.isRead && (
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${urgent ? 'bg-red-500' : 'bg-blue-500'}`} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {urgent && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold uppercase tracking-wide leading-none">
                              {t('notifications.urgent')}
                            </span>
                          )}
                          <p className={`text-sm truncate ${n.isRead ? 'text-fg/80' : 'text-fg font-medium'}`}>{n.title}</p>
                        </div>
                        {n.body && <p className="text-xs text-muted truncate">{n.body}</p>}
                        {n.createdAt && <p className="text-[11px] text-muted mt-0.5">{relativeTime(n.createdAt)}</p>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
