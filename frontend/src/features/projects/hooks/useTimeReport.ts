import { useState, useEffect, useCallback } from 'react';
import { TimeReport, timeReportApi } from '../api/timeReport';

export function useTimeReport(projectId: string) {
  const [data, setData] = useState<TimeReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await timeReportApi.get(projectId);
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
