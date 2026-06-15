export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const MONTHS_RO = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

export function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

export function formatDateNice(date: Date): string {
  return `${date.getDate()} ${MONTHS_RO[date.getMonth()]}`;
}

export function formatDateFull(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function formatWeekRange(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} - ${end.getDate()} ${MONTHS_FULL[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${MONTHS_RO[start.getMonth()]} - ${end.getDate()} ${MONTHS_RO[end.getMonth()]} ${end.getFullYear()}`;
}

export function formatISO(date: Date): string {
  // Use local date parts, NOT toISOString() which converts to UTC
  // and can shift the date back by 1 day for UTC+ timezones
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function getDayOfWeek(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day; // 1=Mon, 7=Sun
}

/**
 * Compact relative-time label without any date library.
 * `lang` selects the unit suffixes (RO default, RU). Anything ~> 7 days
 * falls back to a short absolute date so the label stays readable.
 */
export function relativeTime(iso: string, lang: 'ro' | 'ru' = 'ro'): string {
  const then = new Date(iso);
  if (isNaN(then.getTime())) return '';
  const diffMs = Date.now() - then.getTime();
  const sec = Math.round(diffMs / 1000);

  const U = {
    ro: { now: 'acum', m: 'min', h: 'h', d: 'z' },
    ru: { now: 'только что', m: 'мин', h: 'ч', d: 'дн' },
  }[lang];

  if (sec < 45) return U.now;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} ${U.m}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ${U.h}`;
  const day = Math.round(hr / 24);
  if (day <= 7) return `${day} ${U.d}`;
  return formatDateNice(then);
}
