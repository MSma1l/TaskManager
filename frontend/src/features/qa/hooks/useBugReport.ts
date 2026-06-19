import { useState, useEffect, useCallback } from 'react';
import {
  BugReportDetail,
  UpdateBugReportData,
  bugReportsApi,
} from '../api/bugReports';

/** Detail of a single report + all the mutations the drawer needs. */
export function useBugReport(projectId: string, reportId: string | null) {
  const [report, setReport] = useState<BugReportDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!projectId || !reportId) {
      setReport(null);
      return;
    }
    setLoading(true);
    try {
      const data = await bugReportsApi.get(projectId, reportId);
      setReport(data);
    } catch {
      // ignore — keep last good state
    } finally {
      setLoading(false);
    }
  }, [projectId, reportId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const update = async (data: UpdateBugReportData) => {
    if (!reportId) return;
    const updated = await bugReportsApi.update(projectId, reportId, data);
    setReport(updated);
    return updated;
  };

  const addAttachment = async (imageData: string, caption?: string) => {
    if (!reportId) return;
    await bugReportsApi.addAttachment(projectId, reportId, imageData, caption);
    await fetch();
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!reportId) return;
    await bugReportsApi.removeAttachment(projectId, reportId, attachmentId);
    await fetch();
  };

  const addComment = async (body: string) => {
    if (!reportId) return;
    await bugReportsApi.addComment(projectId, reportId, body);
    await fetch();
  };

  const removeComment = async (commentId: string) => {
    if (!reportId) return;
    await bugReportsApi.removeComment(projectId, reportId, commentId);
    await fetch();
  };

  return {
    report,
    loading,
    refetch: fetch,
    update,
    addAttachment,
    removeAttachment,
    addComment,
    removeComment,
  };
}
