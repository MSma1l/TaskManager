import { useState, useMemo } from 'react';
import { getWeekStart, addDays, formatISO } from '../../../shared/utils/dates';

export function useWeek() {
  const [offset, setOffset] = useState(0);

  const weekStart = useMemo(() => {
    const base = getWeekStart();
    return addDays(base, offset * 7);
  }, [offset]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const weekStartISO = formatISO(weekStart);

  const goNext = () => setOffset((o) => o + 1);
  const goPrev = () => setOffset((o) => o - 1);
  const goToday = () => setOffset(0);

  return { weekStart, weekDays, weekStartISO, offset, goNext, goPrev, goToday };
}
