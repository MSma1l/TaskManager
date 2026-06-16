import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../../shared/i18n/I18nProvider';
import { relativeTime } from '../../../shared/utils/dates';
import { notificationsApi, AppNotification } from '../api/notifications';

/**
 * Centru de notificări in-app: clopoțel cu badge de necitite (top-right) +
 * dropdown cu lista. Polling ușor al contorului; lista se încarcă la deschidere.
 */
export default function NotificationBell() {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const { count } = await notificationsApi.unreadCount();
      setCount(count);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshCount();
    const id = window.setInterval(refreshCount, 30000);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openPanel = async () => {
    setOpen((v) => !v);
    if (!open) {
      setLoading(true);
      try {
        setItems(await notificationsApi.list());
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
  };

  const onRowClick = async (n: AppNotification) => {
    try {
      if (!n.isRead) {
        await notificationsApi.markRead(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        refreshCount();
      }
    } catch { /* ignore */ }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setCount(0);
    } catch { /* ignore */ }
  };

  return (
    <div
      ref={ref}
      className="fixed z-40"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.6rem)', right: '0.8rem' }}
    >
      <button
        type="button"
        onClick={openPanel}
        aria-label={t('notifications.title')}
        className="relative w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-fg hover:bg-elevated shadow"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-elevated border border-border rounded-xl shadow-xl overflow-hidden">
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
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onRowClick(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/60 hover:bg-surface transition-colors ${
                    n.isRead ? '' : 'bg-blue-500/5'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${n.isRead ? 'text-fg/80' : 'text-fg font-medium'}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-muted truncate">{n.body}</p>}
                      {n.createdAt && <p className="text-[11px] text-muted mt-0.5">{relativeTime(n.createdAt)}</p>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
