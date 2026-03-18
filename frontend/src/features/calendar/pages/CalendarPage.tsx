import { useState, useEffect, useRef } from 'react';
import { calendarApi, CalendarEvent, CreateEventData } from '../api/calendar';

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0-23
const HOUR_HEIGHT = 60; // px per hour
const DAYS_RO = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sam', 'Dum'];
const MONTHS_RO = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

const EVENT_COLORS = [
  { name: 'Albastru', value: '#3b82f6' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Rosu', value: '#ef4444' },
  { name: 'Galben', value: '#eab308' },
  { name: 'Violet', value: '#a855f7' },
  { name: 'Roz', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Portocaliu', value: '#f97316' },
];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function snapToQuarter(mins: number): number {
  return Math.round(mins / 15) * 15;
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('09:00');
  const [formColor, setFormColor] = useState('#3b82f6');

  const scrollRef = useRef<HTMLDivElement>(null);
  const weekDays = getWeekDays(weekStart);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const start = formatDate(weekDays[0]);
      const end = formatDate(weekDays[6]);
      const data = await calendarApi.getEvents(start, end);
      setEvents(data);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [weekStart]);

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, []);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const goToday = () => setWeekStart(getMonday(new Date()));

  const openCreateModal = (date: Date, startTime?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormDesc('');
    setFormDate(formatDate(date));
    setFormStart(startTime || '08:00');
    setFormEnd(startTime ? minutesToTime(timeToMinutes(startTime) + 60) : '09:00');
    setFormColor('#3b82f6');
    setShowModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDesc(event.description || '');
    setFormDate(event.eventDate);
    setFormStart(event.startTime);
    setFormEnd(event.endTime);
    setFormColor(event.color || '#3b82f6');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    try {
      if (editingEvent) {
        await calendarApi.updateEvent(editingEvent.id, {
          title: formTitle,
          description: formDesc || undefined,
          color: formColor,
          eventDate: formDate,
          startTime: formStart,
          endTime: formEnd,
        });
      } else {
        await calendarApi.createEvent({
          title: formTitle,
          description: formDesc || undefined,
          color: formColor,
          eventDate: formDate,
          startTime: formStart,
          endTime: formEnd,
        });
      }
      setShowModal(false);
      fetchEvents();
    } catch (err) {
      console.error('Failed to save event:', err);
    }
  };

  const handleDelete = async (eventId: string) => {
    try {
      await calendarApi.deleteEvent(eventId);
      fetchEvents();
      setShowModal(false);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const handleDayClick = (dayDate: Date, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mins = snapToQuarter(Math.floor((y / HOUR_HEIGHT) * 60));
    const time = minutesToTime(Math.min(mins, 23 * 60));
    openCreateModal(dayDate, time);
  };

  const today = new Date();
  const todayStr = formatDate(today);

  // Week title
  const monthStart = MONTHS_RO[weekDays[0].getMonth()];
  const monthEnd = MONTHS_RO[weekDays[6].getMonth()];
  const yearStart = weekDays[0].getFullYear();
  const weekTitle = monthStart === monthEnd
    ? `${monthStart} ${yearStart}`
    : `${monthStart} - ${monthEnd} ${yearStart}`;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div>
          <h1 className="text-xl font-bold text-white">Calendar</h1>
          <p className="text-sm text-slate-400">{weekTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-slate-700 rounded-lg transition-colors">
            Azi
          </button>
          <button onClick={nextWeek} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="flex border-b border-slate-700">
        <div className="w-14 flex-shrink-0" /> {/* time gutter */}
        {weekDays.map((day, i) => {
          const isToday = formatDate(day) === todayStr;
          return (
            <div key={i} className="flex-1 text-center py-2 border-l border-slate-700/50">
              <div className={`text-xs ${isToday ? 'text-blue-400' : 'text-slate-400'}`}>
                {DAYS_RO[i]}
              </div>
              <div className={`text-lg font-semibold mt-0.5 ${
                isToday
                  ? 'bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto'
                  : 'text-slate-200'
              }`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-slate-900/50 z-10 flex items-center justify-center">
            <div className="text-slate-400">Se incarca...</div>
          </div>
        )}
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Time labels */}
          <div className="w-14 flex-shrink-0 relative">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full text-right pr-2 text-xs text-slate-500"
                style={{ top: h * HOUR_HEIGHT - 6 }}
              >
                {h > 0 ? `${h.toString().padStart(2, '0')}:00` : ''}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const dayStr = formatDate(day);
            const dayEvents = events.filter(e => e.eventDate === dayStr);
            const isToday = dayStr === todayStr;

            return (
              <div
                key={dayIdx}
                className={`flex-1 relative border-l border-slate-700/50 cursor-pointer ${
                  isToday ? 'bg-blue-500/5' : ''
                }`}
                onClick={(e) => handleDayClick(day, e)}
              >
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-slate-700/30"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}
                {/* Half-hour lines */}
                {HOURS.map(h => (
                  <div
                    key={`half-${h}`}
                    className="absolute w-full border-t border-slate-700/15"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && (
                  <CurrentTimeLine />
                )}

                {/* Events */}
                {dayEvents.map(event => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(event);
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating add button */}
      <button
        onClick={() => openCreateModal(new Date())}
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-40"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-slate-800 rounded-xl p-5 w-full max-w-md border border-slate-700 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-4">
              {editingEvent ? 'Editeaza eveniment' : 'Eveniment nou'}
            </h2>

            {/* Title */}
            <input
              type="text"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="Titlu eveniment..."
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 mb-3 border border-slate-600 focus:border-blue-500 focus:outline-none placeholder-slate-400"
              autoFocus
            />

            {/* Description */}
            <textarea
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              placeholder="Descriere (optional)..."
              rows={2}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 mb-3 border border-slate-600 focus:border-blue-500 focus:outline-none placeholder-slate-400 resize-none"
            />

            {/* Date */}
            <div className="mb-3">
              <label className="text-xs text-slate-400 mb-1 block">Data</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Time range */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Ora inceput</label>
                <input
                  type="time"
                  value={formStart}
                  onChange={e => setFormStart(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Ora sfarsit</label>
                <input
                  type="time"
                  value={formEnd}
                  onChange={e => setFormEnd(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Color picker */}
            <div className="mb-4">
              <label className="text-xs text-slate-400 mb-2 block">Culoare</label>
              <div className="flex gap-2 flex-wrap">
                {EVENT_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setFormColor(c.value)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      formColor === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {editingEvent && (
                <button
                  onClick={() => handleDelete(editingEvent.id)}
                  className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors text-sm"
                >
                  Sterge
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white rounded-lg transition-colors text-sm"
              >
                Anuleaza
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {editingEvent ? 'Salveaza' : 'Adauga'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Event block that spans visually based on start/end time ──

function EventBlock({ event, onClick }: { event: CalendarEvent; onClick: (e: React.MouseEvent) => void }) {
  const startMins = timeToMinutes(event.startTime);
  const endMins = timeToMinutes(event.endTime);
  const duration = Math.max(endMins - startMins, 15); // minimum 15min visual
  const top = (startMins / 60) * HOUR_HEIGHT;
  const height = (duration / 60) * HOUR_HEIGHT;
  const isShort = duration <= 30;

  return (
    <div
      onClick={onClick}
      className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer hover:brightness-110 transition-all border border-white/10 shadow-sm z-10"
      style={{
        top,
        height: Math.max(height, 18),
        backgroundColor: event.color || '#3b82f6',
      }}
    >
      <div className={`${isShort ? 'flex items-center gap-1' : ''}`}>
        <p className="text-white text-xs font-semibold truncate leading-tight">
          {event.title}
        </p>
        <p className={`text-white/70 text-[10px] leading-tight ${isShort ? 'flex-shrink-0' : ''}`}>
          {event.startTime} - {event.endTime}
        </p>
      </div>
      {!isShort && event.description && (
        <p className="text-white/60 text-[10px] mt-0.5 line-clamp-2 leading-tight">
          {event.description}
        </p>
      )}
    </div>
  );
}

// ── Red line showing current time ──

function CurrentTimeLine() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const mins = now.getHours() * 60 + now.getMinutes();
  const top = (mins / 60) * HOUR_HEIGHT;

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 bg-red-500 rounded-full -ml-1" />
        <div className="flex-1 border-t-2 border-red-500" />
      </div>
    </div>
  );
}
