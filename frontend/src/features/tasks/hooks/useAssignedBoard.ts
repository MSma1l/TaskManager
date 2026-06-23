import { useCallback, useEffect, useState } from 'react';
import { assignedApi, AssignedBoardResponse } from '../api/assigned';

/** Board-ul „Repartizate" agregat pe zone, opțional filtrat după proiect. */
export function useAssignedBoard(projectId?: string) {
  const [data, setData] = useState<AssignedBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await assignedApi.getBoard(projectId);
      setData(res);
    } catch {
      // ignore — păstrăm ultima stare bună
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, refetch: fetch };
}
