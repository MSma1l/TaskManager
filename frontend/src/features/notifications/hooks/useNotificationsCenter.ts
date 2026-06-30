import { useCallback, useEffect, useState } from 'react';
import { notificationsApi, AppNotification } from '../api/notifications';

/**
 * Logica centrului de notificari, reutilizabila intre suprafete (sidebar
 * desktop + bara de jos pe mobil). Tine contorul de necitite (polling 30s),
 * lista (incarcata lazy la deschidere) si actiunile de marcare ca citit.
 */
export function useNotificationsCenter() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

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

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await notificationsApi.list());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const markReadRow = useCallback(async (n: AppNotification) => {
    if (n.isRead) return;
    try {
      await notificationsApi.markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      refreshCount();
    } catch { /* ignore */ }
  }, [refreshCount]);

  const markAll = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setCount(0);
    } catch { /* ignore */ }
  }, []);

  return { count, items, loading, refreshCount, loadList, markReadRow, markAll };
}
