import { useEffect, useMemo, useState } from 'react';
import { calendarApi, CalendarEvent, EventCategory } from '../api/calendar';
import type { CreateEventData } from '../api/calendar';
import { formatDate, getMonday, MONTHS_RO, DAYS_RO_LONG } from '../utils/dates';
import DayView from '../components/DayView';
import WeekView from '../components/WeekView';
import MonthView from '../components/MonthView';
import EventModal from '../components/EventModal';

type ViewMode = 'day' | 'week' | 'month';

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('calendarView') as ViewMode) || 'week');
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState(formatDate(new Date()));
  const [defaultStart, setDefaultStart] = useState('09:00');
  const [defaultEnd, setDefaultEnd] = useState('10:00');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { localStorage.setItem('calendarView', view); }, [view]);

  // Compute the visible date range based on view
  const range = useMemo(() => {
    if (view === 'day') {
      return { start: formatDate(cursor), end: formatDate(cursor), title: dayTitle(cursor) };
    }
    if (view === 'week') {
      const monday = getMonday(cursor);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { start: formatDate(monday), end: formatDate(sunday), title: weekTitle(monday, sunday) };
    }
    // month — pad to full grid (6 weeks)
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startGrid = getMonday(first);
    const lastGrid = new Date(startGrid); lastGrid.setDate(startGrid.getDate() + 41);
    return { start: formatDate(startGrid), end: formatDate(lastGrid), title: `${MONTHS_RO[cursor.getMonth()]} ${cursor.getFullYear()}` };
  }, [view, cursor]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await calendarApi.getEvents(range.start, range.end);
      setEvents(data);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const cats = await calendarApi.getCategories();
      setCategories(cats);
      setHiddenCats(new Set(cats.filter((c) => !c.isVisible).map((c) => c.id)));
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { fetchEvents(); /* eslint-disable-next-line */ }, [range.start, range.end]);

  const visibleEvents = useMemo(() =>
    events.filter((e) => !e.categoryId || !hiddenCats.has(e.categoryId)),
  [events, hiddenCats]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const move = (delta: number) => {
    const d = new Date(cursor);
    if (view === 'day') d.setDate(d.getDate() + delta);
    else if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setCursor(d);
  };
  const goToday = () => setCursor(new Date());

  // ── Modal ──────────────────────────────────────────────────────────────
  const openCreate = (date: Date, start = '09:00', end = '10:00') => {
    setEditingEvent(null);
    setDefaultDate(formatDate(date));
    setDefaultStart(start);
    setDefaultEnd(end);
    setShowModal(true);
  };
  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setDefaultDate(event.eventDate);
    setDefaultStart(event.startTime);
    setDefaultEnd(event.endTime);
    setShowModal(true);
  };
  const handleCellClick = (date: Date, time: string) => {
    const start = time;
    const [h, m] = time.split(':').map(Number);
    const endMins = Math.min(24 * 60 - 1, h * 60 + m + 60);
    const end = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
    openCreate(date, start, end);
  };

  const handleSave = async (data: CreateEventData) => {
    try {
      if (editingEvent) await calendarApi.updateEvent(editingEvent.masterId || editingEvent.id, data);
      else await calendarApi.createEvent(data);
      setShowModal(false);
      fetchEvents();
    } catch (err) {
      console.error('Save error', err);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    if (!confirm(`Sterge "${editingEvent.title}"?`)) return;
    await calendarApi.deleteEvent(editingEvent.masterId || editingEvent.id);
    setShowModal(false);
    fetchEvents();
  };

  const toggleCat = async (cat: EventCategory) => {
    const next = new Set(hiddenCats);
    if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
    setHiddenCats(next);
    try {
      await calendarApi.updateCategory(cat.id, { isVisible: !next.has(cat.id) });
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="md:hidden p-2 hover:bg-fg/10 rounded-lg"
            aria-label="Toggle sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold">Calendar</h1>
            <p className="text-xs sm:text-sm text-muted">{range.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button onClick={() => move(-1)} className="p-2 hover:bg-fg/10 rounded-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-fg/10 rounded-lg">
            Azi
          </button>
          <button onClick={() => move(1)} className="p-2 hover:bg-fg/10 rounded-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div className="hidden sm:flex items-center bg-input rounded-lg p-0.5 ml-2">
            {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  view === v ? 'bg-blue-600 text-white' : 'text-muted hover:text-fg'
                }`}
              >
                {v === 'day' && 'Zi'}
                {v === 'week' && 'Saptamana'}
                {v === 'month' && 'Luna'}
              </button>
            ))}
          </div>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ViewMode)}
            className="sm:hidden text-xs bg-input border border-border rounded-lg px-2 py-1"
          >
            <option value="day">Zi</option>
            <option value="week">Saptamana</option>
            <option value="month">Luna</option>
          </select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — categories */}
        <aside
          className={`${sidebarOpen ? 'block absolute z-30 inset-y-0 left-0 top-[3.25rem]' : 'hidden'} md:block md:relative md:z-auto md:inset-auto w-56 border-r border-border bg-surface flex-shrink-0 overflow-y-auto p-3`}
        >
          <h3 className="text-xs uppercase tracking-wide text-muted mb-2">Calendare</h3>
          <ul className="space-y-1">
            {categories.map((c) => {
              const visible = !hiddenCats.has(c.id);
              return (
                <li key={c.id}>
                  <label className="flex items-center gap-2 cursor-pointer text-sm py-1 px-1 rounded hover:bg-fg/5">
                    <input type="checkbox" checked={visible} onChange={() => toggleCat(c)} />
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 truncate">{c.icon ? `${c.icon} ` : ''}{c.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            onClick={() => openCreate(new Date())}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium"
          >
            + Eveniment nou
          </button>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {loading && (
            <div className="absolute top-2 right-3 text-xs text-muted">se incarca…</div>
          )}
          {view === 'day' && (
            <DayView date={cursor} events={visibleEvents} onCellClick={handleCellClick} onEventClick={openEdit} />
          )}
          {view === 'week' && (
            <WeekView weekStart={getMonday(cursor)} events={visibleEvents} onCellClick={handleCellClick} onEventClick={openEdit} />
          )}
          {view === 'month' && (
            <MonthView monthStart={cursor} events={visibleEvents} onDayClick={(d) => openCreate(d)} onEventClick={openEdit} />
          )}
        </div>
      </div>

      {/* Floating add */}
      <button
        onClick={() => openCreate(cursor)}
        className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center z-40"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <EventModal
        open={showModal}
        initialEvent={editingEvent}
        defaultDate={defaultDate}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
        categories={categories}
        onSave={handleSave}
        onDelete={editingEvent ? handleDelete : undefined}
        onClose={() => setShowModal(false)}
      />
    </div>
  );
}

function dayTitle(d: Date): string {
  const day = DAYS_RO_LONG[(d.getDay() + 6) % 7];
  return `${day}, ${d.getDate()} ${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`;
}
function weekTitle(monday: Date, sunday: Date): string {
  const m1 = MONTHS_RO[monday.getMonth()];
  const m2 = MONTHS_RO[sunday.getMonth()];
  const y = sunday.getFullYear();
  return m1 === m2 ? `${m1} ${y}` : `${m1} – ${m2} ${y}`;
}
