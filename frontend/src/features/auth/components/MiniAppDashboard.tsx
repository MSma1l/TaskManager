import { useEffect, useMemo, useState } from 'react';
import { tasksApi, Task } from '../../tasks/api/tasks';
import { calendarApi, CalendarEvent } from '../../calendar/api/calendar';
import { completionsApi } from '../../tasks/api/completions';
import { formatISO, getWeekStart, getDayOfWeek } from '../../../shared/utils/dates';
import { useT, useI18n } from '../../../shared/i18n/I18nProvider';
import LanguageSwitcher from '../../../shared/i18n/LanguageSwitcher';

type Tab = 'tasks' | 'calendar';

const DAY_NAMES = {
  ro: ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica'],
  ru: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
};
const MONTH_NAMES = {
  ro: ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
       'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
};

interface Props {
  username: string | null;
  fullName: string | null;
  colorScheme: 'light' | 'dark';
  /** Open the full web app (regular routes) on this phone — used for power features */
  onOpenFullApp: () => void;
}

/**
 * Outlook-mobile-style focused dashboard shown inside the Telegram Mini App.
 * Two tabs: today's tasks (with quick "done" action) and today's calendar.
 * Designed to fit a small phone viewport with no scrolling needed for short
 * task lists.
 */
export default function MiniAppDashboard({ username, fullName, colorScheme, onOpenFullApp }: Props) {
  const t = useT();
  const { lang } = useI18n();
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayIso = formatISO(today);
  const todayDow = getDayOfWeek(today);
  const weekStart = useMemo(() => getWeekStart(today), [today]);
  const weekStartIso = formatISO(weekStart);

  const niceDate = `${DAY_NAMES[lang][todayDow - 1]}, ${today.getDate()} ${MONTH_NAMES[lang][today.getMonth()]}`;

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [weekTasks, dayEvents] = await Promise.all([
        tasksApi.getWeek(weekStartIso),
        calendarApi.getEvents(todayIso, todayIso),
      ]);
      setTasks(weekTasks.filter((t: Task) => t.dayOfWeek === todayDow));
      setEvents(dayEvents.sort((a: CalendarEvent, b: CalendarEvent) =>
        a.isAllDay && !b.isAllDay ? -1
        : !a.isAllDay && b.isAllDay ? 1
        : a.startTime.localeCompare(b.startTime),
      ));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare incarcare date');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkDone = async (taskId: string) => {
    try {
      await completionsApi.markDone(taskId);
      // Optimistic update
      setTasks((prev) => prev.map((t) =>
        t.id === taskId
          ? { ...t, completions: [{ ...(t.completions?.[0] || {} as any), status: 'DONE' }] }
          : t,
      ));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare marcare task');
    }
  };

  const isLight = colorScheme === 'light';
  const bg = isLight ? '#f8fafc' : '#0f172a';
  const fg = isLight ? '#0f172a' : '#f8fafc';
  const surface = isLight ? '#ffffff' : '#1e293b';
  const border = isLight ? '#e2e8f0' : '#334155';
  const muted = isLight ? '#64748b' : '#94a3b8';
  const accent = '#3b82f6';

  const doneTasks = tasks.filter((t) => t.completions?.[0]?.status === 'DONE').length;
  const pendingEvents = events.length;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: bg, color: fg }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3" style={{ borderBottom: `1px solid ${border}` }}>
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: muted }}>{niceDate}</p>
          <h1 className="text-xl font-bold mt-0.5 truncate">
            {t('miniApp.welcome')}{fullName ? `, ${fullName.split(' ')[0]}` : username ? `, @${username}` : ''}!
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: muted }}>
            {tab === 'tasks'
              ? `${doneTasks}/${tasks.length} ${t('miniApp.tasksProgress')}`
              : `${pendingEvents} ${pendingEvents === 1 ? t('miniApp.eventsCount') : t('miniApp.eventsCountPl')} ${t('miniApp.eventsScheduled')}`}
          </p>
        </div>
        <LanguageSwitcher compact />
      </div>

      {/* Tabs */}
      <div className="flex px-2 pt-2" style={{ borderBottom: `1px solid ${border}` }}>
        <TabBtn active={tab === 'tasks'} onClick={() => setTab('tasks')} accent={accent} muted={muted}>
          {t('miniApp.tabTasks')}
        </TabBtn>
        <TabBtn active={tab === 'calendar'} onClick={() => setTab('calendar')} accent={accent} muted={muted}>
          {t('miniApp.tabCalendar')}
        </TabBtn>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {error && (
          <div className="rounded-lg p-3 mb-3 text-sm"
               style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-sm" style={{ color: muted }}>{t('common.loading')}</div>
        ) : tab === 'tasks' ? (
          tasks.length === 0 ? (
            <Empty
              icon="checkmark"
              title={t('miniApp.noTasks')}
              subtitle={t('miniApp.noTasksHint')}
              muted={muted}
            />
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => {
                const status = t.completions?.[0]?.status || 'PENDING';
                const done = status === 'DONE';
                return (
                  <li
                    key={t.id}
                    className="rounded-xl p-3 flex items-center gap-3"
                    style={{ backgroundColor: surface, border: `1px solid ${border}` }}
                  >
                    <button
                      onClick={() => !done && handleMarkDone(t.id)}
                      disabled={done}
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        backgroundColor: done ? '#10b981' : 'transparent',
                        border: done ? 'none' : `2px solid ${muted}`,
                      }}
                      aria-label="Marcheaza ca facut"
                    >
                      {done && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}
                      >
                        {t.title}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: muted }}>
                        {t.category?.icon} {t.category?.name}
                        {t.reminderTime && ` · ${t.reminderTime}`}
                        {t.estimatedMinutes && ` · ~${t.estimatedMinutes}m`}
                      </p>
                    </div>
                    {t.priority && t.priority !== 'MEDIUM' && (
                      <span
                        className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: t.priority === 'URGENT' ? '#ef4444' : t.priority === 'HIGH' ? '#f59e0b' : '#94a3b8',
                          color: 'white',
                        }}
                      >
                        {t.priority === 'URGENT' ? '!!' : t.priority === 'HIGH' ? '!' : '·'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          /* Calendar tab — today's events */
          events.length === 0 ? (
            <Empty
              icon="calendar"
              title={t('miniApp.noEvents')}
              subtitle={t('miniApp.noEventsHint')}
              muted={muted}
            />
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl overflow-hidden flex"
                  style={{ backgroundColor: surface, border: `1px solid ${border}` }}
                >
                  <div className="w-1.5" style={{ backgroundColor: e.color || '#3b82f6' }} />
                  <div className="flex-1 p-3 min-w-0">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="text-[11px]" style={{ color: muted }}>
                      {e.isAllDay ? t('miniApp.allDay') : `${e.startTime} - ${e.endTime}`}
                      {e.location && ` · ${e.location}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {/* Footer with full-app link */}
      <div className="px-3 py-3 flex justify-between items-center" style={{ borderTop: `1px solid ${border}` }}>
        <button
          type="button"
          onClick={loadAll}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: muted }}
        >
          {t('miniApp.reload')}
        </button>
        <button
          type="button"
          onClick={onOpenFullApp}
          className="text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ color: accent }}
        >
          {t('miniApp.fullApp')}
        </button>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children, accent, muted }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  accent: string;
  muted: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-2.5 text-sm font-medium relative"
      style={{ color: active ? accent : muted }}
    >
      {children}
      {active && (
        <span
          className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
          style={{ backgroundColor: accent }}
        />
      )}
    </button>
  );
}

function Empty({ icon, title, subtitle, muted }: {
  icon: 'checkmark' | 'calendar';
  title: string;
  subtitle: string;
  muted: string;
}) {
  return (
    <div className="text-center py-12">
      <div
        className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3"
        style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}
      >
        {icon === 'checkmark' ? (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ) : (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="text-xs mt-1" style={{ color: muted }}>{subtitle}</p>
    </div>
  );
}

