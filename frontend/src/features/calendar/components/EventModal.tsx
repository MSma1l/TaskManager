import { useEffect, useState } from 'react';
import {
  CalendarEvent, CreateEventData, EventCategory, EventType, RecurrenceRule, Attendee,
} from '../api/calendar';

const EVENT_COLORS = [
  '#3b82f6', '#22c55e', '#ef4444', '#eab308', '#a855f7', '#ec4899', '#06b6d4', '#f97316',
];

const EVENT_TYPES: { value: EventType; label: string; icon: string }[] = [
  { value: 'meeting_online',    label: 'Sedinta online',    icon: '💻' },
  { value: 'meeting_in_person', label: 'Sedinta in persoana', icon: '🏢' },
  { value: 'appointment',       label: 'Programare',         icon: '📌' },
  { value: 'reminder',          label: 'Reminder',           icon: '🔔' },
  { value: 'personal',          label: 'Personal',           icon: '🌳' },
  { value: 'task',              label: 'Task',               icon: '✓' },
];

const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: 'NONE', label: 'Nu se repeta' },
  { value: 'DAILY', label: 'Zilnic' },
  { value: 'WEEKLY', label: 'Saptamanal' },
  { value: 'MONTHLY', label: 'Lunar' },
  { value: 'YEARLY', label: 'Anual' },
];

const REMINDER_PRESETS = [
  { value: 0,    label: 'La inceput' },
  { value: 5,    label: '5 min inainte' },
  { value: 10,   label: '10 min inainte' },
  { value: 15,   label: '15 min inainte' },
  { value: 30,   label: '30 min inainte' },
  { value: 60,   label: '1 ora inainte' },
  { value: 120,  label: '2 ore inainte' },
  { value: 1440, label: '1 zi inainte' },
];

interface Props {
  open: boolean;
  initialEvent: CalendarEvent | null;
  defaultDate: string;
  defaultStart: string;
  defaultEnd: string;
  categories: EventCategory[];
  onSave: (data: CreateEventData) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function EventModal({
  open, initialEvent, defaultDate, defaultStart, defaultEnd,
  categories, onSave, onDelete, onClose,
}: Props) {
  const [tab, setTab] = useState<'general' | 'reminders' | 'attendees'>('general');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [eventType, setEventType] = useState<EventType>('personal');
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceRule>('NONE');
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [reminders, setReminders] = useState<number[]>([15]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab('general');
    if (initialEvent) {
      setTitle(initialEvent.title);
      setDescription(initialEvent.description || '');
      setEventDate(initialEvent.eventDate);
      setStartTime(initialEvent.startTime);
      setEndTime(initialEvent.endTime);
      setColor(initialEvent.color || EVENT_COLORS[0]);
      setEventType(initialEvent.eventType || 'personal');
      setLocation(initialEvent.location || '');
      setMeetingUrl(initialEvent.meetingUrl || '');
      setIsAllDay(!!initialEvent.isAllDay);
      setRecurrence((initialEvent.recurrenceRule as RecurrenceRule) || 'NONE');
      setRecurrenceUntil(initialEvent.recurrenceUntil || '');
      setReminders(initialEvent.reminderMinutes && initialEvent.reminderMinutes.length ? initialEvent.reminderMinutes : []);
      setCategoryId(initialEvent.categoryId || '');
      setAttendees(initialEvent.attendees || []);
    } else {
      setTitle('');
      setDescription('');
      setEventDate(defaultDate);
      setStartTime(defaultStart);
      setEndTime(defaultEnd);
      setColor(EVENT_COLORS[0]);
      setEventType('personal');
      setLocation('');
      setMeetingUrl('');
      setIsAllDay(false);
      setRecurrence('NONE');
      setRecurrenceUntil('');
      setReminders([15]);
      const def = categories.find((c) => c.isDefault) || categories[0];
      setCategoryId(def?.id || '');
      setAttendees([]);
    }
  }, [open, initialEvent, defaultDate, defaultStart, defaultEnd, categories]);

  if (!open) return null;

  const submit = () => {
    if (!title.trim()) return;
    const data: CreateEventData = {
      title: title.trim(),
      description: description.trim() || undefined,
      color,
      eventType,
      location: location.trim() || undefined,
      meetingUrl: meetingUrl.trim() || undefined,
      isAllDay,
      eventDate,
      startTime: isAllDay ? '00:00' : startTime,
      endTime: isAllDay ? '23:59' : endTime,
      recurrenceRule: recurrence === 'NONE' ? null : recurrence,
      recurrenceUntil: recurrenceUntil || null,
      reminderMinutes: reminders,
      categoryId: categoryId || null,
      attendees,
    };
    onSave(data);
  };

  const toggleReminder = (mins: number) => {
    setReminders((prev) => prev.includes(mins) ? prev.filter((m) => m !== mins) : [...prev, mins].sort((a, b) => a - b));
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface text-fg rounded-xl w-full max-w-lg border border-border max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">{initialEvent ? 'Editeaza eveniment' : 'Eveniment nou'}</h2>
            <button onClick={onClose} className="text-muted hover:text-fg">✕</button>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titlu eveniment..."
            className="w-full bg-input text-fg rounded-lg px-3 py-2 mb-3 border border-border focus:border-blue-500 focus:outline-none placeholder-muted"
            autoFocus
          />

          <div className="flex gap-1 border-b border-border mb-4">
            {(['general', 'reminders', 'attendees'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                  tab === t ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {t === 'general' && 'General'}
                {t === 'reminders' && `Reminderuri${reminders.length ? ` (${reminders.length})` : ''}`}
                {t === 'attendees' && `Participanti${attendees.length ? ` (${attendees.length})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pb-3 space-y-3">
          {tab === 'general' && (
            <>
              {/* Type pills */}
              <div className="grid grid-cols-3 gap-2">
                {EVENT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setEventType(t.value)}
                    className={`text-xs flex flex-col items-center gap-1 py-2 rounded-lg border transition-colors ${
                      eventType === t.value
                        ? 'border-blue-500 bg-blue-500/10 text-fg'
                        : 'border-border text-muted hover:text-fg'
                    }`}
                  >
                    <span className="text-lg leading-none">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              {/* Conditional location/url */}
              {eventType === 'meeting_online' && (
                <Field label="Link sedinta">
                  <input
                    type="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className={inputCls}
                  />
                </Field>
              )}
              {(eventType === 'meeting_in_person' || eventType === 'appointment') && (
                <Field label="Locatie">
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Adresa, sala..."
                    className={inputCls}
                  />
                </Field>
              )}

              <Field label="Categorie">
                <select
                  value={categoryId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCategoryId(id);
                    const cat = categories.find((c) => c.id === id);
                    if (cat) setColor(cat.color);
                  }}
                  className={inputCls}
                >
                  <option value="">— fara —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ''}{c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                />
                Toata ziua
              </label>

              <Field label="Data">
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className={inputCls}
                />
              </Field>

              {!isAllDay && (
                <div className="flex gap-3">
                  <Field label="Inceput" className="flex-1">
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Sfarsit" className="flex-1">
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
                  </Field>
                </div>
              )}

              <Field label="Recurenta">
                <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as RecurrenceRule)} className={inputCls}>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              {recurrence !== 'NONE' && (
                <Field label="Pana la (optional)">
                  <input
                    type="date"
                    value={recurrenceUntil}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              )}

              <Field label="Descriere / Agenda">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Topic, agenda, note..."
                />
              </Field>

              <Field label="Culoare">
                <div className="flex gap-2 flex-wrap">
                  {EVENT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      type="button"
                      className={`w-7 h-7 rounded-full transition-all ${
                        color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface scale-110' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </Field>
            </>
          )}

          {tab === 'reminders' && (
            <div className="space-y-2">
              <p className="text-xs text-muted mb-2">
                Notificari trimise pe Telegram (si in browser daca e deschis).
              </p>
              {REMINDER_PRESETS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm py-1">
                  <input
                    type="checkbox"
                    checked={reminders.includes(r.value)}
                    onChange={() => toggleReminder(r.value)}
                  />
                  {r.label}
                </label>
              ))}
              {reminders.length === 0 && (
                <p className="text-xs text-yellow-500/80">Niciun reminder activ pentru acest eveniment.</p>
              )}
            </div>
          )}

          {tab === 'attendees' && (
            <AttendeesEditor attendees={attendees} onChange={setAttendees} />
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          {initialEvent && onDelete && (
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-600/15 text-red-500 rounded-lg hover:bg-red-600/25 transition-colors text-sm"
            >
              Sterge
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-muted hover:text-fg rounded-lg transition-colors text-sm">
            Anuleaza
          </button>
          <button
            onClick={submit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {initialEvent ? 'Salveaza' : 'Adauga'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttendeesEditor({ attendees, onChange }: { attendees: Attendee[]; onChange: (a: Attendee[]) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const add = () => {
    const n = name.trim();
    if (!n) return;
    onChange([...attendees, { name: n, email: email.trim() || undefined }]);
    setName('');
    setEmail('');
  };

  const remove = (i: number) => onChange(attendees.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nume" className={`${inputCls} flex-1`} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email (optional)" className={`${inputCls} flex-1`} />
        <button onClick={add} className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded-lg text-sm">+</button>
      </div>
      {attendees.length === 0 && <p className="text-xs text-muted">Niciun participant adaugat.</p>}
      <ul className="space-y-1">
        {attendees.map((a, i) => (
          <li key={i} className="flex items-center justify-between bg-input rounded-lg px-3 py-2 text-sm">
            <div>
              <p>{a.name}</p>
              {a.email && <p className="text-xs text-muted">{a.email}</p>}
            </div>
            <button onClick={() => remove(i)} className="text-muted hover:text-red-500 text-sm">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const inputCls =
  'w-full bg-input text-fg rounded-lg px-3 py-2 border border-border focus:border-blue-500 focus:outline-none placeholder-muted';

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className || ''}`}>
      <span className="text-xs text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}
