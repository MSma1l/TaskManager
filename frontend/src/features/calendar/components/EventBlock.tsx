import { CalendarEvent } from '../api/calendar';

const TYPE_ICONS: Record<string, string> = {
  meeting_online: '💻',
  meeting_in_person: '🏢',
  appointment: '📌',
  reminder: '🔔',
  personal: '🌳',
  task: '✓',
};

interface Props {
  event: CalendarEvent;
  top: number;
  height: number;
  onClick: (e: React.MouseEvent) => void;
}

export default function EventBlock({ event, top, height, onClick }: Props) {
  const isShort = height <= 30;
  const tentative = event.eventStatus === 'TENTATIVE';
  const cancelled = event.eventStatus === 'CANCELLED';

  return (
    <div
      onClick={onClick}
      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer hover:brightness-110 transition-all border border-white/10 shadow-sm z-10 ${
        cancelled ? 'opacity-50 line-through' : ''
      } ${tentative ? 'border-dashed' : ''}`}
      style={{
        top,
        height: Math.max(height, 18),
        backgroundColor: event.color || '#3b82f6',
      }}
      title={event.title}
    >
      <div className={isShort ? 'flex items-center gap-1' : ''}>
        <p className="text-white text-xs font-semibold truncate leading-tight">
          {TYPE_ICONS[event.eventType] && <span className="mr-1">{TYPE_ICONS[event.eventType]}</span>}
          {event.title}
          {event.isRecurringInstance && <span className="ml-1 opacity-70">↻</span>}
        </p>
        <p className={`text-white/70 text-[10px] leading-tight ${isShort ? 'flex-shrink-0' : ''}`}>
          {event.startTime}–{event.endTime}
        </p>
      </div>
      {!isShort && event.location && (
        <p className="text-white/70 text-[10px] mt-0.5 truncate leading-tight">📍 {event.location}</p>
      )}
      {!isShort && event.meetingUrl && (
        <p className="text-white/70 text-[10px] mt-0.5 truncate leading-tight">🔗 {event.meetingUrl}</p>
      )}
    </div>
  );
}
