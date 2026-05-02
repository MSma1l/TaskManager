import { CalendarEvent } from '../api/calendar';
import { DAYS_RO_SHORT, formatDate, getMonthGrid } from '../utils/dates';

interface Props {
  monthStart: Date; // any date inside the month
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export default function MonthView({ monthStart, events, onDayClick, onEventClick }: Props) {
  const grid = getMonthGrid(monthStart);
  const todayStr = formatDate(new Date());
  const monthIdx = monthStart.getMonth();

  // Group events by date string
  const byDate: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    if (!byDate[e.eventDate]) byDate[e.eventDate] = [];
    byDate[e.eventDate].push(e);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS_RO_SHORT.map((d) => (
          <div key={d} className="text-center text-xs text-muted py-2">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {grid.map((day, idx) => {
          const dayStr = formatDate(day);
          const dayEvents = (byDate[dayStr] || []).sort((a, b) => a.startTime.localeCompare(b.startTime));
          const isCurrentMonth = day.getMonth() === monthIdx;
          const isToday = dayStr === todayStr;
          return (
            <div
              key={idx}
              onClick={() => onDayClick(day)}
              className={`border-r border-b border-border/50 p-1 cursor-pointer min-h-[80px] flex flex-col gap-0.5 hover:bg-fg/5 transition-colors ${
                !isCurrentMonth ? 'bg-fg/[0.02] text-muted' : ''
              } ${isToday ? 'ring-1 ring-inset ring-blue-500/40' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${
                  isToday ? 'bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center' : ''
                }`}>
                  {day.getDate()}
                </span>
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-muted">+{dayEvents.length - 3}</span>
                )}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                    className="block w-full text-left text-[10px] px-1 py-0.5 rounded text-white truncate"
                    style={{ backgroundColor: e.color || '#3b82f6' }}
                    title={`${e.startTime}–${e.endTime} ${e.title}`}
                  >
                    {!e.isAllDay && <span className="opacity-80 mr-1">{e.startTime}</span>}
                    {e.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
