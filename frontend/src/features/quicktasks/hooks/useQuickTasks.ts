import { useCallback, useEffect, useState } from 'react';
import { QuickTask, QuickTaskStatus, quickTasksApi } from '../api/quicktasks';

/**
 * Inbox-ul de quick task-uri pentru admin. Face polling usor (~45s) ca taskurile
 * noi trimise din formularul public sa apara fara refresh manual.
 */
export function useQuickTasks(status: QuickTaskStatus | 'ALL' = 'NEW') {
  const [items, setItems] = useState<QuickTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const data = await quickTasksApi.list(status);
      setItems(data);
    } catch {
      // ignore — pastram lista anterioara
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    const onFocus = () => fetch();
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetch();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(fetch, 45000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, [fetch]);

  const assign = async (id: string, projectId: string, assigneeId: string) => {
    await quickTasksApi.assign(id, projectId, assigneeId);
    setItems((prev) => prev.filter((q) => q.id !== id));
  };

  const dismiss = async (id: string) => {
    await quickTasksApi.dismiss(id);
    setItems((prev) => prev.filter((q) => q.id !== id));
  };

  return { items, loading, refetch: fetch, assign, dismiss };
}
