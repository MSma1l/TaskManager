import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarEvent } from '../api/calendar';
import {
  DAYS_RO_LONG, DAYS_RO_SHORT, MONTHS_RO,
  formatDate, getMonday, getMonthGrid, isSameDay,
} from '../utils/dates';

type SubView = 'agenda' | 'day' | 'month';

interface Props {
  events: CalendarEvent[];
  cursor: Date;
  setCursor: (d: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onCellClick: (date: Date, time: string) => void;
}

/**
 * Outlook-style mobile calendar:
 *  - Mini month strip at the top (week view of the cursor week, single tap to switch days)
 *  - Three sub-views: Agenda (list), Day (timed grid), Month (compact grid + agenda below)
 *  - Default sub-view is `agenda` which scales the best on small screens.
 */
export default function MobileCalendar({ events, cursor, setCursor, onEventClick, onCellClick }: Props) {
  const [sub, setSub] = useState<SubView>(() => (localStorage.getItem('calendarMobileSub') as SubView) || 'agenda');
  useEffect(() => { localStorage.setItem('calendarMobileSub', sub); }, [sub]);

  const todayStr = formatDate(new Date());
  const monday = useMemo(() => getMonday(cursor), [cursor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  }), [monday]);

  const move = (delta: number) => {
    const d = new Date(cursor);
    if (sub === 'month') d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + (sub === 'agenda' ? delta * 7 : delta));
    setCursor(d);
  };

  return (
    <div className="md:hidden flex flex-col flex-1 overflow-hidden">
      {/* Sub-view toggle */}
      <div className="flex justify-center px-2 pt-2 pb-1">
        <div className="inline-flex bg-input border border-border rounded-full p-0.5">
          {(['agenda', 'day', 'month'] as SubView[]).map((v) => (
            <button
              key={v}
              onClick={() => setSub(v)}
              className={`px-3 py-1 text-[12px] font-medium rounded-full transition-colors ${
                sub === v ? 'bg-blue-600 text-white' : 'text-muted'
              }`}
            >
              {v === 'agenda' && 'Agenda'}
              {v === 'day' && 'Zi'}
              {v === 'month' && 'Luna'}
            </button>
          ))}
        </div>
      </div>

      {/* Day picker strip (week-of-cursor) */}
      {sub !== 'month' && (
        <div className="px-2 pb-1 grid grid-cols-7 gap-1">
          {weekDays.map((d, i) => {
            const sel = isSameDay(d, cursor);
            const today = formatDate(d) === todayStr;
            const dayEvents = events.filter((e) => e.eventDate === formatDate(d));
            return (
              <button
                key={i}
                onClick={() => setCursor(d)}
                className={`relative flex flex-col items-center py-1.5 rounded-lg transition-colors ${
                  sel
                    ? 'bg-blue-600 text-white'
                    : today
                    ? 'bg-blue-500/10 text-blue-500'
                    : 'text-fg/80 hover:bg-fg/5'
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider opacity-75">{DAYS_RO_SHORT[i]}</span>
                <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                {dayEvents.length > 0 && (
                  <span className={`absolute bottom-1 w-1 h-1 rounded-full ${sel ? 'bg-white' : 'bg-blue-500'}`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Header navigation */}
      <div className="flex items-center justify-between px-3 py-1 text-sm">
        <button onClick={() => move(-1)} className="px-2 py-1 text-muted hover:text-fg">‹</button>
        <span className="font-medium">
          {sub === 'month'
            ? `${MONTHS_RO[cursor.getMonth()]} ${cursor.getFullYear()}`
            : `${cursor.getDate()} ${MONTHS_RO[cursor.getMonth()]} ${cursor.getFullYear()}`}
        </span>
        <button onClick={() => move(1)} className="px-2 py-1 text-muted hover:text-fg">›</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {sub === 'agenda' && (
          <AgendaView events={events} weekDays={weekDays} todayStr={todayStr} onEventClick={onEventClick} />
        )}
        {sub === 'day' && (
          <DayCompact events={events} date={cursor} onCellClick={onCellClick} onEventClick={onEventClick} />
        )}
        {sub === 'month' && (
          <MonthCompact cursor={cursor} setCursor={setCursor} events={events} onEventClick={onEventClick} />
        )}
      </div>
    </div>
  );
}

// ── Agenda — vertical list of days with their events ──────────────────────
function AgendaView({ events, weekDays, todayStr, onEventClick }: {
  events: CalendarEvent[];
  weekDays: Date[];
  todayStr: string;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const grouped = weekDays.map((d) => ({
    date: d,
    key: formatDate(d),
    events: events
      .filter((e) => e.eventDate === formatDate(d))
      .sort((a, b) => (a.isAllDay && !b.isAllDay ? -1 : !a.isAllDay && b.isAllDay ? 1 : a.startTime.localeCompare(b.startTime))),
  }));

  return (
    <div className="px-3 py-2 space-y-3">
      {grouped.map((g) => {
        const isToday = g.key === todayStr;
        const dayName = DAYS_RO_LONG[(g.date.getDay() + 6) % 7];
        return (
          <div key={g.key} className="">
            <div className="flex items-baseline justify-between mb-1.5 sticky top-0 bg-bg/95 backdrop-blur py-1">
              <div className={`flex items-center gap-2 ${isToday ? 'text-blue-500' : ''}`}>
                <span className={`text-2xl font-bold ${isToday ? 'bg-blue-500 text-white rounded-full w-9 h-9 flex items-center justify-center text-base' : ''}`}>
                  {g.date.getDate()}
                </span>
                <div className="flex flex-col leading-tight">
                  <span className="text-xs uppercase tracking-wide text-muted">{dayName.slice(0, 3)}</span>
                  <span className="text-[10px] text-muted">{MONTHS_RO[g.date.getMonth()].slice(0, 3)}</span>
                </div>
              </div>
              {g.events.length > 0 && (
                <span className="text-xs text-muted">
                  {g.events.length} eveniment{g.events.length !== 1 ? 'e' : ''}
                </span>
              )}
            </div>
            {g.events.length === 0 ? (
              <p className="text-xs text-muted italic ml-12">Nimic programat</p>
            ) : (
              <div className="space-y-1.5 ml-12">
                {g.events.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    className="w-full text-left flex items-stretch gap-2 bg-surface border border-border rounded-lg overflow-hidden hover:border-blue-500/40 transition-colors"
                  >
                    <span className="w-1 flex-shrink-0" style={{ backgroundColor: e.color || '#3b82f6' }} />
                    <div className="flex-1 py-2 pr-2 min-w-0">
                      <p className="text-sm font-medium truncate text-fg">{e.title}</p>
                      <p className="text-[11px] text-muted">
                        {e.isAllDay ? 'Toata ziua' : `${e.startTime} – ${e.endTime}`}
                        {e.location && <> · 📍 {e.location}</>}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Day compact (Outlook-style timeline) ──────────────────────────────────
const HOUR_HEIGHT_M = 50;

function DayCompact({ events, date, onCellClick, onEventClick }: {
  events: CalendarEvent[];
  date: Date;
  onCellClick: (date: Date, time: string) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT_M;
  }, []);

  const dayStr = formatDate(date);
  const dayEvents = events.filter((e) => e.eventDate === dayStr);
  const allDay = dayEvents.filter((e) => e.isAllDay);
  const timed = dayEvents.filter((e) => !e.isAllDay);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const total = Math.floor((y / HOUR_HEIGHT_M) * 60);
    const snap = Math.max(0, Math.round(total / 15) * 15);
    const h = Math.floor(snap / 60);
    const m = snap % 60;
    onCellClick(date, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex flex-col h-full">
      {allDay.length > 0 && (
        <div className="px-2 pb-1 space-y-1">
          {allDay.map((e) => (
            <button
              key={e.id}
              onClick={() => onEventClick(e)}
              className="block w-full text-left text-xs px-2 py-1 rounded text-white"
              style={{ backgroundColor: e.color || '#3b82f6' }}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT_M }}>
          <div className="w-12 flex-shrink-0 relative">
            {HOURS.map((h) => (
              <div key={h} className="absolute w-full text-right pr-1.5 text-[10px] text-muted" style={{ top: h * HOUR_HEIGHT_M - 5 }}>
                {h > 0 ? `${String(h).padStart(2, '0')}:00` : ''}
              </div>
            ))}
          </div>
          <div onClick={handleClick} className="flex-1 relative border-l border-border cursor-pointer">
            {HOURS.map((h) => (
              <div key={h} className="absolute w-full border-t border-border/40" style={{ top: h * HOUR_HEIGHT_M }} />
            ))}
            {timed.map((event) => {
              const [sh, sm] = event.startTime.split(':').map(Number);
              const [eh, em] = event.endTime.split(':').map(Number);
              const startMin = sh * 60 + sm;
              const endMin = eh * 60 + em;
              const top = (startMin / 60) * HOUR_HEIGHT_M;
              const height = Math.max(20, ((endMin - startMin) / 60) * HOUR_HEIGHT_M);
              return (
                <button
                  key={event.id}
                  onClick={(ev) => { ev.stopPropagation(); onEventClick(event); }}
                  className="absolute left-1 right-1 rounded text-left text-white text-xs px-1.5 py-0.5 overflow-hidden"
                  style={{ top, height, backgroundColor: event.color || '#3b82f6' }}
                >
                  <div className="truncate font-medium leading-tight">{event.title}</div>
                  <div className="truncate text-[10px] opacity-90">{event.startTime} – {event.endTime}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Month compact (mini grid + selected day list below) ───────────────────
function MonthCompact({ cursor, setCursor, events, onEventClick }: {
  cursor: Date;
  setCursor: (d: Date) => void;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const grid = getMonthGrid(cursor);
  const todayStr = formatDate(new Date());
  const cursorMonth = cursor.getMonth();
  const selectedStr = formatDate(cursor);

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  events.forEach((e) => {
    if (!eventsByDate[e.eventDate]) eventsByDate[e.eventDate] = [];
    eventsByDate[e.eventDate].push(e);
  });

  const selectedEvents = (eventsByDate[selectedStr] || [])
    .sort((a, b) => (a.isAllDay && !b.isAllDay ? -1 : !a.isAllDay && b.isAllDay ? 1 : a.startTime.localeCompare(b.startTime)));

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 px-1">
        {DAYS_RO_SHORT.map((d) => (
          <div key={d} className="text-center text-[10px] text-muted py-1">{d.slice(0, 2)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px px-1">
        {grid.map((day, i) => {
          const dayStr = formatDate(day);
          const isCurMonth = day.getMonth() === cursorMonth;
          const isToday = dayStr === todayStr;
          const isSelected = dayStr === selectedStr;
          const dots = (eventsByDate[dayStr] || []).slice(0, 3);
          return (
            <button
              key={i}
              onClick={() => setCursor(day)}
              className={`aspect-square flex flex-col items-center justify-center rounded text-sm transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : isToday
                  ? 'bg-blue-500/15 text-blue-500 font-bold'
                  : isCurMonth
                  ? 'text-fg hover:bg-fg/5'
                  : 'text-muted/60'
              }`}
            >
              <span className="leading-none">{day.getDate()}</span>
              {dots.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dots.map((e, k) => (
                    <span
                      key={k}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: isSelected ? 'white' : (e.color || '#3b82f6') }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-border mt-2 pt-2 px-3 pb-3">
        <p className="text-xs uppercase tracking-wider text-muted mb-2">
          {DAYS_RO_LONG[(cursor.getDay() + 6) % 7]}, {cursor.getDate()} {MONTHS_RO[cursor.getMonth()]}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-xs text-muted italic">Nimic programat</p>
        ) : (
          <div className="space-y-1.5">
            {selectedEvents.map((e) => (
              <button
                key={e.id}
                onClick={() => onEventClick(e)}
                className="w-full text-left flex items-stretch gap-2 bg-surface border border-border rounded-lg overflow-hidden"
              >
                <span className="w-1" style={{ backgroundColor: e.color || '#3b82f6' }} />
                <div className="flex-1 py-1.5 pr-2 min-w-0">
                  <p className="text-sm font-medium truncate">{e.title}</p>
                  <p className="text-[11px] text-muted">
                    {e.isAllDay ? 'Toata ziua' : `${e.startTime} – ${e.endTime}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
