import { useEffect, useRef } from 'react';
import { CalendarEvent } from '../api/calendar';
import { formatDate, timeToMinutes, minutesToTime, snapToQuarter } from '../utils/dates';
import EventBlock from './EventBlock';
import CurrentTimeLine from './CurrentTimeLine';

const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface Props {
  date: Date;
  events: CalendarEvent[];
  onCellClick: (date: Date, time: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export default function DayView({ date, events, onCellClick, onEventClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  const dayStr = formatDate(date);
  const todayStr = formatDate(new Date());
  const isToday = dayStr === todayStr;

  const dayEvents = events.filter((e) => e.eventDate === dayStr);
  const allDayEvents = dayEvents.filter((e) => e.isAllDay);
  const timedEvents = dayEvents.filter((e) => !e.isAllDay);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mins = snapToQuarter(Math.floor((y / HOUR_HEIGHT) * 60));
    onCellClick(date, minutesToTime(Math.min(mins, 23 * 60)));
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {allDayEvents.length > 0 && (
        <div className="border-b border-border px-2 py-1 space-y-1">
          {allDayEvents.map((e) => (
            <button
              key={e.id}
              onClick={() => onEventClick(e)}
              className="w-full text-left text-xs px-2 py-1 rounded text-white"
              style={{ backgroundColor: e.color || '#3b82f6' }}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="w-14 flex-shrink-0 relative">
            {HOURS.map((h) => (
              <div key={h} className="absolute w-full text-right pr-2 text-xs text-muted" style={{ top: h * HOUR_HEIGHT - 6 }}>
                {h > 0 ? `${h.toString().padStart(2, '0')}:00` : ''}
              </div>
            ))}
          </div>
          <div className={`flex-1 relative border-l border-border cursor-pointer ${isToday ? 'bg-blue-500/5' : ''}`} onClick={handleClick}>
            {HOURS.map((h) => (
              <div key={h} className="absolute w-full border-t border-border/40" style={{ top: h * HOUR_HEIGHT }} />
            ))}
            {HOURS.map((h) => (
              <div key={`half-${h}`} className="absolute w-full border-t border-border/20" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
            ))}
            {isToday && <CurrentTimeLine hourHeight={HOUR_HEIGHT} />}
            {timedEvents.map((event) => {
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
        </div>
      </div>
    </div>
  );
}
