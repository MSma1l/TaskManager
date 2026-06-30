import { ProjectZone } from '../api/projects';

export type DeadlineUnit = 'days' | 'weeks';

/** Whole calendar days between today (local midnight) and the given ISO date. */
export function wholeDaysFromToday(iso: string): number {
  const target = new Date(iso);
  if (isNaN(target.getTime())) return 0;
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t1 = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((t1 - t0) / 86400000);
}

/** ISO datetime for today + N (days|weeks), anchored at local noon to dodge TZ day-shift. */
export function offsetToISO(qty: number, unit: DeadlineUnit): string {
  const days = unit === 'weeks' ? qty * 7 : qty;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** ISO string → yyyy-mm-dd for a native date input. */
export function isoToInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** yyyy-mm-dd → ISO datetime (local noon), or null when empty. */
export function inputValueToISO(val: string): string | null {
  if (!val) return null;
  const [y, m, d] = val.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** Days a freshly-dropped card gets suggested per target zone. */
const ZONE_SUGGESTED_DAYS: Record<ProjectZone, number> = {
  URGENT: 5,
  MEDIUM: 10,
  NORMAL: 21,
  BACKLOG: 0,
};

/**
 * Suggested deadline ISO for a card dropped into `zone`
 * (URGENT → +5d, MEDIUM → +10d, NORMAL → +21d), anchored at local noon.
 */
export function zoneSuggestedDeadlineIso(zone: ProjectZone): string {
  return offsetToISO(ZONE_SUGGESTED_DAYS[zone] ?? 0, 'days');
}
