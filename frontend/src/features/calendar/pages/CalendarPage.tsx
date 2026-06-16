import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calendarApi, CalendarEvent, EventCategory } from '../api/calendar';
import type { CreateEventData } from '../api/calendar';
import { formatDate, getMonday, MONTHS_RO, DAYS_RO_LONG } from '../utils/dates';
import DayView from '../components/DayView';
import WeekView from '../components/WeekView';
import MonthView from '../components/MonthView';
import MobileCalendar from '../components/MobileCalendar';
import EventModal from '../components/EventModal';

type ViewMode = 'day' | 'week' | 'month';

export default function CalendarPage() {
  const navigate = useNavigate();
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
  const [editingCat, setEditingCat] = useState<EventCategory | null>(null);
  const [showNewCat, setShowNewCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState('#3b82f6');
  const [catIcon, setCatIcon] = useState('');

  useEffect(() => { localStorage.setItem('calendarView', view); }, [view]);

  // Compute the visible date range based on view
  // (mobile always needs at least the cursor's week for the agenda sub-view)
  const range = useMemo(() => {
    // Always fetch the full month grid containing the cursor — this covers
    // every desktop view AND the mobile agenda/day/month sub-views without
    // needing per-mobile-sub fetches.
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startGrid = getMonday(first);
    const lastGrid = new Date(startGrid); lastGrid.setDate(startGrid.getDate() + 41);
    let title: string;
    if (view === 'day') title = dayTitle(cursor);
    else if (view === 'week') {
      const monday = getMonday(cursor);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      title = weekTitle(monday, sunday);
    } else {
      title = `${MONTHS_RO[cursor.getMonth()]} ${cursor.getFullYear()}`;
    }
    return { start: formatDate(startGrid), end: formatDate(lastGrid), title };
  }, [view, cursor]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const [data, taskItems] = await Promise.all([
        calendarApi.getEvents(range.start, range.end),
        calendarApi.getTaskItems(range.start, range.end).catch(() => []),
      ]);
      // Taskurile atribuite cu data devin "evenimente" read-only in calendar.
      const taskEvents: CalendarEvent[] = taskItems.map((ti) => {
        const [h, m] = (ti.startTime || '09:00').split(':').map(Number);
        const endMins = Math.min(24 * 60 - 1, (h || 9) * 60 + (m || 0) + 30);
        const end = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
        return {
          id: ti.id,
          masterId: ti.taskId,
          title: ti.title,
          description: null,
          color: '#64748b',
          eventType: 'task',
          location: null,
          meetingUrl: null,
          isAllDay: false,
          eventStatus: 'CONFIRMED',
          attendanceStatus: 'PENDING',
          attendanceNote: null,
          recurrenceRule: null,
          recurrenceUntil: null,
          reminderMinutes: [],
          attendees: [],
          ownerId: '',
          isOwner: true,
          myAttendance: null,
          participants: [],
          categoryId: null,
          eventDate: ti.eventDate,
          originalDate: ti.eventDate,
          isRecurringInstance: false,
          startTime: ti.startTime || '09:00',
          endTime: end,
          createdAt: '',
          updatedAt: '',
          // marcaj intern pentru a sti ca e un task read-only
          isTaskItem: true,
          taskProjectId: ti.projectId,
        } as CalendarEvent & { isTaskItem: boolean; taskProjectId: string | null };
      });
      setEvents([...data, ...taskEvents]);
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
    // Taskurile de board atribuite sunt read-only in calendar — duc la board.
    const asTask = event as CalendarEvent & { isTaskItem?: boolean; taskProjectId?: string | null };
    if (asTask.isTaskItem) {
      navigate(asTask.taskProjectId ? `/projects/${asTask.taskProjectId}/board` : '/');
      return;
    }
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
    } catch (err: any) {
      console.error('Save error', err);
      // Nu mai eșua tăcut — arată cauza reală userului.
      alert(err?.response?.data?.detail || 'Nu am putut salva evenimentul. Reincearca.');
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    if (!confirm(`Sterge "${editingEvent.title}"?`)) return;
    await calendarApi.deleteEvent(editingEvent.masterId || editingEvent.id);
    setShowModal(false);
    fetchEvents();
  };

  const handleDuplicate = async (data: CreateEventData) => {
    try {
      await calendarApi.createEvent(data);
      setShowModal(false);
      fetchEvents();
    } catch (err) {
      console.error('Duplicate error', err);
    }
  };

  const toggleCat = async (cat: EventCategory) => {
    const next = new Set(hiddenCats);
    if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
    setHiddenCats(next);
    try {
      await calendarApi.updateCategory(cat.id, { isVisible: !next.has(cat.id) });
    } catch { /* ignore */ }
  };

  const startEditCat = (cat: EventCategory) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatColor(cat.color);
    setCatIcon(cat.icon || '');
    setShowNewCat(false);
  };

  const startNewCat = () => {
    setEditingCat(null);
    setCatName('');
    setCatColor('#3b82f6');
    setCatIcon('');
    setShowNewCat(true);
  };

  const cancelCatEdit = () => {
    setEditingCat(null);
    setShowNewCat(false);
    setCatName('');
    setCatIcon('');
  };

  const saveCat = async () => {
    const name = catName.trim();
    if (!name) return;
    try {
      if (editingCat) {
        await calendarApi.updateCategory(editingCat.id, { name, color: catColor, icon: catIcon || undefined });
      } else {
        await calendarApi.createCategory({ name, color: catColor, icon: catIcon || undefined });
      }
      cancelCatEdit();
      fetchCategories();
    } catch (err) {
      console.error('Save category error', err);
    }
  };

  const deleteCat = async (cat: EventCategory) => {
    if (!confirm(`Sterge categoria "${cat.name}"? Evenimentele asociate raman, dar fara categorie.`)) return;
    try {
      await calendarApi.deleteCategory(cat.id);
      fetchCategories();
      fetchEvents();
    } catch (err) {
      console.error('Delete category error', err);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] md:h-[calc(100vh-5rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border bg-surface sticky top-0 z-20">
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
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Calendar</h1>
            <p className="text-sm text-muted font-medium leading-tight">{range.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button onClick={() => move(-1)} className="p-2 hover:bg-fg/10 rounded-lg" title="Inapoi">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button onClick={goToday} className="px-3 py-1.5 text-sm font-semibold text-blue-500 hover:bg-fg/10 rounded-lg">
            Azi
          </button>
          <button onClick={() => move(1)} className="p-2 hover:bg-fg/10 rounded-lg" title="Inainte">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div data-tour="calendar-views" className="hidden sm:flex items-center bg-input border border-border rounded-lg p-0.5 ml-2">
            {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === v ? 'bg-blue-600 text-white shadow-sm' : 'text-muted hover:text-fg'
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
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wide text-muted">Calendare</h3>
            <button
              onClick={startNewCat}
              className="text-xs text-blue-500 hover:text-blue-400"
              title="Adauga categorie noua"
            >
              + Nou
            </button>
          </div>
          <ul className="space-y-1">
            {categories.map((c) => {
              const visible = !hiddenCats.has(c.id);
              return (
                <li key={c.id} className="group">
                  <div className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-fg/5">
                    <input type="checkbox" checked={visible} onChange={() => toggleCat(c)} className="cursor-pointer" />
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 truncate">{c.icon ? `${c.icon} ` : ''}{c.name}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                      <button onClick={() => startEditCat(c)} className="text-muted hover:text-fg p-0.5" title="Editeaza">✎</button>
                      <button onClick={() => deleteCat(c)} className="text-muted hover:text-red-500 p-0.5" title="Sterge">✕</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {(showNewCat || editingCat) && (
            <div className="mt-3 p-3 bg-elevated rounded-lg border border-border space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted">
                {editingCat ? 'Editeaza categorie' : 'Categorie noua'}
              </p>
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Nume"
                className="w-full bg-input text-fg border border-border focus:border-blue-500 outline-none rounded px-2 py-1.5 text-sm"
                autoFocus
              />
              <input
                type="text"
                value={catIcon}
                onChange={(e) => setCatIcon(e.target.value)}
                placeholder="Emoji (optional)"
                maxLength={4}
                className="w-full bg-input text-fg border border-border focus:border-blue-500 outline-none rounded px-2 py-1.5 text-sm"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Culoare:</span>
                <input
                  type="color"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="w-8 h-7 rounded border border-border cursor-pointer"
                />
                <span className="text-xs text-muted font-mono">{catColor}</span>
              </div>
              <div className="flex gap-1.5 pt-1">
                <button onClick={saveCat} disabled={!catName.trim()} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded py-1.5 text-xs">
                  {editingCat ? 'Salveaza' : 'Adauga'}
                </button>
                <button onClick={cancelCatEdit} className="flex-1 bg-elevated hover:bg-fg/10 text-fg rounded py-1.5 text-xs border border-border">
                  Anuleaza
                </button>
              </div>
            </div>
          )}

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
            <div className="absolute top-2 right-3 text-xs text-muted z-10">se incarca…</div>
          )}
          {/* Mobile (Outlook-style) */}
          <MobileCalendar
            events={visibleEvents}
            cursor={cursor}
            setCursor={setCursor}
            onEventClick={openEdit}
            onCellClick={handleCellClick}
          />
          {/* Desktop */}
          <div className="hidden md:flex md:flex-col md:flex-1 md:overflow-hidden">
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
      </div>

      {/* Floating add — positioned above BottomNav with safe-area awareness */}
      <button
        onClick={() => openCreate(cursor)}
        className="md:hidden fixed right-4 w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center z-40 active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
        aria-label="Eveniment nou"
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
        onDuplicate={editingEvent ? handleDuplicate : undefined}
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
