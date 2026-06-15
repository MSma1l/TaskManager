import { useState, useEffect, useCallback, useRef } from 'react';
import { TaskComment, commentsApi } from '../api/comments';

const POLL_INTERVAL = 10000;

/**
 * Comments for a single board task. Polls every ~10s while the drawer is open.
 * Pass `taskId = null` to disable (drawer closed) — no fetching happens.
 */
export function useComments(taskId: string | null) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(
    async (showLoading = false) => {
      if (!taskId) return;
      if (showLoading) setLoading(true);
      try {
        const data = await commentsApi.list(taskId);
        setComments(data);
      } catch {
        // ignore — keep last good state
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [taskId],
  );

  useEffect(() => {
    if (!taskId) {
      setComments([]);
      return;
    }
    fetch(true);
    intervalRef.current = setInterval(() => fetch(false), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [taskId, fetch]);

  const add = async (body: string) => {
    if (!taskId) return;
    await commentsApi.create(taskId, body);
    await fetch(false);
  };

  const edit = async (commentId: string, body: string) => {
    if (!taskId) return;
    await commentsApi.update(taskId, commentId, body);
    await fetch(false);
  };

  const remove = async (commentId: string) => {
    if (!taskId) return;
    await commentsApi.remove(taskId, commentId);
    await fetch(false);
  };

  return { comments, loading, refetch: () => fetch(false), add, edit, remove };
}
