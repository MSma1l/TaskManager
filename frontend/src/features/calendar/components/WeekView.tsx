import { useEffect, useRef } from 'react';
import { CalendarEvent } from '../api/calendar';
import { DAYS_RO_SHORT, formatDate, getWeekDays, timeToMinutes, minutesToTime, snapToQuarter } from '../utils/dates';
import EventBlock from './EventBlock';
import CurrentTimeLine from './CurrentTimeLine';

const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface Props {
  weekStart: Date;
  events: CalendarEvent[];
  onCellClick: (date: Date, time: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export default function WeekView({ weekStart, events, onCellClick, onEventClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekDays = getWeekDays(weekStart);
  const todayStr = formatDate(new Date());

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  const allDayByDay: Record<string, CalendarEvent[]> = {};
  weekDays.forEach((d) => { allDayByDay[formatDate(d)] = []; });
  events.forEach((e) => {
    if (e.isAllDay && allDayByDay[e.eventDate]) {
      allDayByDay[e.eventDate].push(e);
    }
  });
  const hasAnyAllDay = Object.values(allDayByDay).some((arr) => arr.length > 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b-2 border-border bg-surface">
        <div className="w-14 flex-shrink-0" />
        {weekDays.map((day, i) => {
          const isToday = formatDate(day) === todayStr;
          const isWeekend = i >= 5;
          return (
            <div
              key={i}
              className={`flex-1 text-center py-2 border-l border-border ${isToday ? 'bg-blue-500/10' : ''}`}
            >
              <div className={`text-xs font-semibold uppercase tracking-wider ${
                isToday ? 'text-blue-500' : isWeekend ? 'text-red-400/80' : 'text-muted'
              }`}>
                {DAYS_RO_SHORT[i]}
              </div>
              <div className={`text-xl font-bold mt-1 ${
                isToday ? 'bg-blue-500 text-white w-9 h-9 rounded-full flex items-center justify-center mx-auto shadow-md' : 'text-fg'
              }`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day banner */}
      {hasAnyAllDay && (
        <div className="flex border-b border-border">
          <div className="w-14 flex-shrink-0 text-right pr-2 py-1 text-xs text-muted">toata ziua</div>
          {weekDays.map((day) => {
            const k = formatDate(day);
            return (
              <div key={k} className="flex-1 border-l border-border/50 p-1 space-y-1 min-h-[28px]">
                {(allDayByDay[k] || []).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    className="block w-full text-left text-[11px] px-1.5 py-0.5 rounded text-white truncate"
                    style={{ backgroundColor: e.color || '#3b82f6' }}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="w-14 flex-shrink-0 relative bg-surface border-r border-border">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute w-full text-right pr-2 text-xs font-medium text-muted"
                style={{ top: h * HOUR_HEIGHT - 6 }}
              >
                {h > 0 ? `${h.toString().padStart(2, '0')}:00` : ''}
              </div>
            ))}
          </div>

          {weekDays.map((day, dayIdx) => {
            const dayStr = formatDate(day);
            const dayEvents = events.filter((e) => e.eventDate === dayStr && !e.isAllDay);
            const isToday = dayStr === todayStr;
            const isWeekend = dayIdx >= 5;

            return (
              <div
                key={dayIdx}
                className={`flex-1 relative border-l border-border cursor-pointer transition-colors ${
                  isToday ? 'bg-blue-500/5'
                  : isWeekend ? 'bg-fg/[0.015] hover:bg-fg/[0.04]'
                  : 'hover:bg-fg/[0.025]'
                }`}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const mins = snapToQuarter(Math.floor((y / HOUR_HEIGHT) * 60));
                  onCellClick(day, minutesToTime(Math.min(mins, 23 * 60)));
                }}
              >
                {HOURS.map((h) => (
                  <div key={h} className="absolute w-full border-t border-border/70" style={{ top: h * HOUR_HEIGHT }} />
                ))}
                {HOURS.map((h) => (
                  <div key={`half-${h}`} className="absolute w-full border-t border-border/30 border-dashed" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                ))}
                {isToday && <CurrentTimeLine hourHeight={HOUR_HEIGHT} />}
                {dayEvents.map((event) => {
                  const startMins = timeToMinutes(event.startTime);
                  const endMins = timeToMinutes(event.endTime);
                  const duration = Math.max(endMins - startMins, 15);
                  const top = (startMins / 60) * HOUR_HEIGHT;
                  const height = (duration / 60) * HOUR_HEIGHT;
                  return (
                    <EventBlock
                      key={event.id}
                      event={event}
                      top={top}
                      height={height}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
