import { useState, useEffect, useCallback } from 'react';
import { Performance, performanceApi } from '../api/performance';

export function usePerformance(projectId: string) {
  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await performanceApi.getPerformance(projectId);
      setData(res);
    } catch {
      // ignore — keep last good state
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, refetch: fetch };
}
