import { useCallback, useEffect, useState } from 'react';
import { AssignedBoardResponse } from '../api/assigned';
import { todayApi } from '../api/today';

/** Board-ul „Astăzi" agregat pe zone (proiecte marcate de admin + Birou). */
export function useTodayBoard() {
  const [data, setData] = useState<AssignedBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await todayApi.getBoard();
      setData(res);
    } catch {
      // ignore — păstrăm ultima stare bună
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, refetch: fetch };
}
