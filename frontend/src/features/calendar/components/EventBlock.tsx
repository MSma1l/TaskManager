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

function isPast(event: CalendarEvent): boolean {
  try {
    const [y, mo, d] = (event.eventDate || '').split('-').map(Number);
    const [h, mi] = (event.endTime || '00:00').split(':').map(Number);
    if (!y || !mo || !d) return false;
    const end = new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
    return end.getTime() < Date.now();
  } catch {
    return false;
  }
}

function attendanceMark(event: CalendarEvent): { icon: string; color: string; label: string } | null {
  if (!isPast(event)) return null;
  switch (event.attendanceStatus) {
    case 'ATTENDED':       return { icon: '✓', color: '#10b981', label: 'Confirmat participat' };
    case 'AUTO_ATTENDED':  return { icon: '✓', color: 'rgba(255,255,255,0.85)', label: 'Auto-bifat: participat' };
    case 'MISSED':         return { icon: '✕', color: '#f87171', label: 'Nu ai fost' };
    case 'PENDING':        return { icon: '?', color: '#fbbf24', label: 'Neconfirmat' };
    default:               return null;
  }
}

export default function EventBlock({ event, top, height, onClick }: Props) {
  const isShort = height <= 30;
  const tentative = event.eventStatus === 'TENTATIVE';
  const cancelled = event.eventStatus === 'CANCELLED';
  const past = isPast(event);
  const mark = attendanceMark(event);
  const isAttended = past && (event.attendanceStatus === 'ATTENDED' || event.attendanceStatus === 'AUTO_ATTENDED');
  const isMissed = past && event.attendanceStatus === 'MISSED';

  // Visual treatment: attended events get desaturated + reduced opacity (look "done");
  // missed events get a hatched overlay; cancelled stays line-through; future is full color.
  const visualClass = cancelled
    ? 'opacity-40 line-through'
    : isAttended
      ? 'opacity-50 saturate-50'
      : isMissed
        ? 'opacity-70 saturate-75'
        : '';

  return (
    <div
      onClick={onClick}
      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer hover:!opacity-100 hover:!saturate-100 hover:brightness-110 transition-all border shadow-sm z-10 ${visualClass} ${tentative ? 'border-dashed' : 'border-white/20'}`}
      style={{
        top,
        height: Math.max(height, 18),
        backgroundColor: event.color || '#3b82f6',
      }}
      title={`${event.title}${mark ? ' — ' + mark.label : ''}`}
    >
      <div className={isShort ? 'flex items-center gap-1' : ''}>
        <p className={`text-white text-xs font-semibold truncate leading-tight ${isAttended ? 'line-through decoration-white/60' : ''}`}>
          {TYPE_ICONS[event.eventType] && <span className="mr-1">{TYPE_ICONS[event.eventType]}</span>}
          {event.title}
          {event.isRecurringInstance && <span className="ml-1 opacity-70">↻</span>}
        </p>
        <p className={`text-white/85 text-[10px] leading-tight font-medium ${isShort ? 'flex-shrink-0' : ''}`}>
          {event.startTime}–{event.endTime}
        </p>
      </div>
      {!isShort && event.location && (
        <p className="text-white/85 text-[10px] mt-0.5 truncate leading-tight">📍 {event.location}</p>
      )}
      {!isShort && event.meetingUrl && (
        <p className="text-white/85 text-[10px] mt-0.5 truncate leading-tight">🔗 {event.meetingUrl}</p>
      )}

      {/* Missed: diagonal hash so it's visually obvious it didn't happen */}
      {isMissed && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 6px)',
          }}
        />
      )}

      {/* Attendance badge in the corner */}
      {mark && (
        <span
          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold leading-none"
          style={{
            backgroundColor: 'rgba(0,0,0,0.45)',
            color: mark.color,
            border: `1px solid ${mark.color}`,
          }}
          title={mark.label}
        >
          {mark.icon}
        </span>
      )}
    </div>
  );
}
