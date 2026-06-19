import { useState, useEffect, useCallback } from 'react';
import {
  BugReportSummary,
  BugStatus,
  CreateBugReportData,
  bugReportsApi,
} from '../api/bugReports';

/** List + create for a project, with an optional status filter. */
export function useBugReports(projectId: string, status?: BugStatus) {
  const [reports, setReports] = useState<BugReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await bugReportsApi.list(projectId, status);
      setReports(data);
    } catch {
      // ignore — keep last good state
    } finally {
      setLoading(false);
    }
  }, [projectId, status]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const create = async (data: CreateBugReportData) => {
    const report = await bugReportsApi.create(projectId, data);
    await fetch();
    return report;
  };

  const remove = async (id: string) => {
    await bugReportsApi.remove(projectId, id);
    await fetch();
  };

  return { reports, loading, refetch: fetch, create, remove };
}
