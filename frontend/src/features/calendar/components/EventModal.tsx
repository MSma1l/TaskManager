import { useEffect, useState } from 'react';
import {
  CalendarEvent, CreateEventData, EventCategory, EventType, RecurrenceRule, Attendee,
  AttendanceStatus, InviteCandidate, calendarApi,
} from '../api/calendar';
import { useLocalDraft } from '../../../shared/hooks/useLocalDraft';
import { useT } from '../../../shared/i18n/I18nProvider';

const DRAFT_KEY = 'event-modal-new';

interface DraftSnapshot {
  title: string;
  description: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  color: string;
  eventType: EventType;
  location: string;
  meetingUrl: string;
  isAllDay: boolean;
  recurrence: RecurrenceRule;
  recurrenceUntil: string;
  reminders: number[];
  categoryId: string;
  attendees: Attendee[];
  participantIds: string[];
}

const EMPTY_DRAFT: DraftSnapshot = {
  title: '', description: '', eventDate: '', startTime: '09:00', endTime: '10:00',
  color: '#3b82f6', eventType: 'personal', location: '', meetingUrl: '',
  isAllDay: false, recurrence: 'NONE', recurrenceUntil: '',
  reminders: [15], categoryId: '', attendees: [], participantIds: [],
};

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
  onDuplicate?: (data: CreateEventData) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function EventModal({
  open, initialEvent, defaultDate, defaultStart, defaultEnd,
  categories, onSave, onDuplicate, onDelete, onClose,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<'general' | 'reminders' | 'attendees'>('general');

  // Persistent draft for new events (so a typed title/description survives reload).
  const [draft, setDraft, clearDraft] = useLocalDraft<DraftSnapshot>(DRAFT_KEY, EMPTY_DRAFT);

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

  // Participanti reali (utilizatori invitati)
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<InviteCandidate[]>([]);

  // true cand userul curent e doar invitat (nu owner) — modul read-only
  const isInvitee = !!initialEvent && initialEvent.isOwner === false;
  const [myAttendance, setMyAttendance] = useState<CalendarEvent['myAttendance']>(null);
  const [inviteSaving, setInviteSaving] = useState(false);

  // Incarca candidatii de invitatie cand owner-ul deschide modalul
  useEffect(() => {
    if (!open || isInvitee) return;
    let alive = true;
    calendarApi.getInviteCandidates()
      .then((c) => { if (alive) setCandidates(c); })
      .catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [open, isInvitee]);

  // Attendance — only meaningful when editing a past event
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>('PENDING');
  const [attendanceNote, setAttendanceNote] = useState('');
  const [attendanceSaving, setAttendanceSaving] = useState(false);

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
      setParticipantIds((initialEvent.participants || []).map((p) => p.userId));
      setMyAttendance(initialEvent.myAttendance || null);
      setAttendanceStatus(initialEvent.attendanceStatus || 'PENDING');
      setAttendanceNote(initialEvent.attendanceNote || '');
    } else {
      // Restore persistent draft if the user was typing one earlier (cloud-like memory).
      const hasDraft = draft.title.trim() !== '' || draft.description.trim() !== '' || draft.attendees.length > 0;
      setTitle(hasDraft ? draft.title : '');
      setDescription(hasDraft ? draft.description : '');
      setEventDate(hasDraft && draft.eventDate ? draft.eventDate : defaultDate);
      setStartTime(hasDraft && draft.startTime ? draft.startTime : defaultStart);
      setEndTime(hasDraft && draft.endTime ? draft.endTime : defaultEnd);
      setColor(hasDraft ? draft.color : EVENT_COLORS[0]);
      setEventType(hasDraft ? draft.eventType : 'personal');
      setLocation(hasDraft ? draft.location : '');
      setMeetingUrl(hasDraft ? draft.meetingUrl : '');
      setIsAllDay(hasDraft ? draft.isAllDay : false);
      setRecurrence(hasDraft ? draft.recurrence : 'NONE');
      setRecurrenceUntil(hasDraft ? draft.recurrenceUntil : '');
      setReminders(hasDraft && draft.reminders.length ? draft.reminders : [15]);
      const def = categories.find((c) => c.isDefault) || categories[0];
      setCategoryId(hasDraft && draft.categoryId ? draft.categoryId : (def?.id || ''));
      setAttendees(hasDraft ? draft.attendees : []);
      setParticipantIds(hasDraft ? (draft.participantIds || []) : []);
      setMyAttendance(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEvent, defaultDate, defaultStart, defaultEnd, categories]);

  // Live-save the draft on every change while creating a new event.
  useEffect(() => {
    if (!open || initialEvent) return;
    setDraft({
      title, description, eventDate, startTime, endTime, color, eventType,
      location, meetingUrl, isAllDay, recurrence, recurrenceUntil,
      reminders, categoryId, attendees, participantIds,
    });
  }, [
    open, initialEvent, setDraft, title, description, eventDate, startTime, endTime,
    color, eventType, location, meetingUrl, isAllDay, recurrence, recurrenceUntil,
    reminders, categoryId, attendees, participantIds,
  ]);

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
      participantIds,
    };
    // Clear draft for new events on successful submit; editing doesn't touch the draft
    if (!initialEvent) clearDraft();
    onSave(data);
  };

  const toggleReminder = (mins: number) => {
    setReminders((prev) => prev.includes(mins) ? prev.filter((m) => m !== mins) : [...prev, mins].sort((a, b) => a - b));
  };

  const isPastEvent = (() => {
    if (!initialEvent) return false;
    try {
      // Build the local datetime from the ISO date + HH:MM time
      const [y, mo, d] = (initialEvent.eventDate || '').split('-').map(Number);
      const [h, mi] = (initialEvent.endTime || '00:00').split(':').map(Number);
      if (!y || !mo || !d) return false;
      const end = new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
      return end.getTime() < Date.now();
    } catch { return false; }
  })();

  const saveAttendance = async (next: AttendanceStatus) => {
    if (!initialEvent) return;
    setAttendanceSaving(true);
    try {
      await calendarApi.setAttendance(initialEvent.masterId || initialEvent.id, next, attendanceNote || null);
      setAttendanceStatus(next);
    } catch (err) {
      console.error('attendance save failed', err);
    } finally {
      setAttendanceSaving(false);
    }
  };

  const respondInvite = async (status: 'ACCEPTED' | 'DECLINED') => {
    if (!initialEvent) return;
    setInviteSaving(true);
    try {
      const res = await calendarApi.respondInvite(initialEvent.masterId || initialEvent.id, status);
      setMyAttendance(res.status);
    } catch (err) {
      console.error('invite response failed', err);
    } finally {
      setInviteSaving(false);
    }
  };

  const duplicate = () => {
    if (!title.trim() || !onDuplicate) return;
    // Default the copy to the next day so the user can quickly paste it forward
    const next = new Date(eventDate);
    next.setDate(next.getDate() + 1);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    const data: CreateEventData = {
      title: `${title.trim()} (copie)`,
      description: description.trim() || undefined,
      color,
      eventType,
      location: location.trim() || undefined,
      meetingUrl: meetingUrl.trim() || undefined,
      isAllDay,
      eventDate: `${yyyy}-${mm}-${dd}`,
      startTime: isAllDay ? '00:00' : startTime,
      endTime: isAllDay ? '23:59' : endTime,
      // Don't carry over recurrence to a copy — it would interfere with the master
      recurrenceRule: null,
      recurrenceUntil: null,
      reminderMinutes: reminders,
      categoryId: categoryId || null,
      attendees,
      participantIds,
    };
    onDuplicate(data);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface text-fg rounded-xl w-full max-w-3xl border border-border max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">
              {isInvitee ? t('calendarInvite.invitedTitle') : (initialEvent ? 'Editeaza eveniment' : 'Eveniment nou')}
            </h2>
            <button onClick={onClose} className="text-muted hover:text-fg">✕</button>
          </div>

          {isInvitee && (
            <InviteBanner
              t={t}
              status={myAttendance}
              busy={inviteSaving}
              onRespond={respondInvite}
            />
          )}

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titlu eveniment..."
            disabled={isInvitee}
            className="w-full bg-input text-fg rounded-lg px-3 py-2 mb-3 border border-border focus:border-blue-500 focus:outline-none placeholder-muted disabled:opacity-70"
            autoFocus={!isInvitee}
          />

          <div className="flex gap-1 border-b border-border mb-4">
            {(['general', 'reminders', 'attendees'] as const).map((tt) => (
              <button
                key={tt}
                onClick={() => setTab(tt)}
                className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                  tab === tt ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {tt === 'general' && 'General'}
                {tt === 'reminders' && `Reminderuri${reminders.length ? ` (${reminders.length})` : ''}`}
                {tt === 'attendees' && `Participanti${(participantIds.length + attendees.length) ? ` (${participantIds.length + attendees.length})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pb-3 space-y-3">
          {tab === 'general' && (
            <>
              {initialEvent && (
                <AttendancePanel
                  status={attendanceStatus}
                  note={attendanceNote}
                  busy={attendanceSaving}
                  isPast={isPastEvent}
                  onChange={saveAttendance}
                  onNoteChange={setAttendanceNote}
                  onNoteBlur={() => saveAttendance(attendanceStatus)}
                />
              )}

              {/* Type pills — full width */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
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

              {/* 2-column form on wider screens — keeps everything visible without scroll */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Conditional location/url */}
                {eventType === 'meeting_online' && (
                  <Field label="Link sedinta" className="sm:col-span-2">
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
                  <Field label="Locatie" className="sm:col-span-2">
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

                <Field label="Recurenta">
                  <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as RecurrenceRule)} className={inputCls}>
                    {RECURRENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Data">
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>

                {recurrence !== 'NONE' ? (
                  <Field label="Recurenta pana la (optional)">
                    <input
                      type="date"
                      value={recurrenceUntil}
                      onChange={(e) => setRecurrenceUntil(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                ) : (
                  <label className="flex items-center gap-2 text-sm self-end pb-2">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(e) => setIsAllDay(e.target.checked)}
                    />
                    Toata ziua
                  </label>
                )}

                {!isAllDay && (
                  <>
                    <Field label="Inceput">
                      <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Sfarsit">
                      <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
                    </Field>
                  </>
                )}

                {recurrence !== 'NONE' && (
                  <label className="flex items-center gap-2 text-sm self-end pb-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(e) => setIsAllDay(e.target.checked)}
                    />
                    Toata ziua
                  </label>
                )}

                <Field label="Descriere / Agenda" className="sm:col-span-2">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className={`${inputCls} resize-none`}
                    placeholder="Topic, agenda, note..."
                  />
                </Field>

                <Field label="Culoare" className="sm:col-span-2">
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
              </div>
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
            <div className="space-y-4">
              <ParticipantSelector
                t={t}
                candidates={candidates}
                selectedIds={participantIds}
                participants={initialEvent?.participants || []}
                readOnly={isInvitee}
                onChange={setParticipantIds}
              />
              <div className="border-t border-border pt-3">
                <p className="text-xs uppercase tracking-wide text-muted mb-2">
                  {t('calendarInvite.externalAttendees')}
                </p>
                <AttendeesEditor attendees={attendees} onChange={setAttendees} readOnly={isInvitee} />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          {!isInvitee && initialEvent && onDelete && (
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-600/15 text-red-500 rounded-lg hover:bg-red-600/25 transition-colors text-sm"
            >
              Sterge
            </button>
          )}
          {!isInvitee && initialEvent && onDuplicate && (
            <button
              onClick={duplicate}
              className="px-4 py-2 bg-emerald-600/15 text-emerald-500 rounded-lg hover:bg-emerald-600/25 transition-colors text-sm"
              title="Creeaza o copie pe ziua urmatoare"
            >
              📋 Copiaza
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-muted hover:text-fg rounded-lg transition-colors text-sm">
            {isInvitee ? t('common.close') : 'Anuleaza'}
          </button>
          {!isInvitee && (
            <button
              onClick={submit}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {initialEvent ? 'Salveaza' : 'Adauga'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AttendeesEditor({ attendees, onChange, readOnly }: { attendees: Attendee[]; onChange: (a: Attendee[]) => void; readOnly?: boolean }) {
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
      {!readOnly && (
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nume" className={`${inputCls} flex-1`} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email (optional)" className={`${inputCls} flex-1`} />
          <button onClick={add} className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded-lg text-sm">+</button>
        </div>
      )}
      {attendees.length === 0 && <p className="text-xs text-muted">Niciun participant extern adaugat.</p>}
      <ul className="space-y-1">
        {attendees.map((a, i) => (
          <li key={i} className="flex items-center justify-between bg-input rounded-lg px-3 py-2 text-sm">
            <div>
              <p>{a.name}</p>
              {a.email && <p className="text-xs text-muted">{a.email}</p>}
            </div>
            {!readOnly && <button onClick={() => remove(i)} className="text-muted hover:text-red-500 text-sm">✕</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

type TFn = (key: string) => string;

function ParticipantSelector({
  t, candidates, selectedIds, participants, readOnly, onChange,
}: {
  t: TFn;
  candidates: InviteCandidate[];
  selectedIds: string[];
  participants: { userId: string; username: string | null; fullName: string | null; status: string }[];
  readOnly?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');

  // Map id -> status pentru afisarea badge-ului (INVITED/ACCEPTED/DECLINED)
  const statusById = new Map(participants.map((p) => [p.userId, p.status]));
  const labelById = new Map(candidates.map((c) => [c.userId, c.fullName || c.username || c.userId]));
  participants.forEach((p) => {
    if (!labelById.has(p.userId)) labelById.set(p.userId, p.fullName || p.username || p.userId);
  });

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  if (readOnly) {
    // Invitee: doar lista participantilor, fara editare
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-muted mb-2">{t('calendarInvite.participants')}</p>
        {participants.length === 0 && <p className="text-xs text-muted">{t('calendarInvite.noParticipants')}</p>}
        <ul className="space-y-1">
          {participants.map((p) => (
            <li key={p.userId} className="flex items-center justify-between bg-input rounded-lg px-3 py-2 text-sm">
              <span>{p.fullName || p.username}</span>
              <StatusBadge t={t} status={p.status} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const filtered = candidates.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (c.fullName || '').toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted">{t('calendarInvite.participants')}</p>

      {selectedIds.length > 0 && (
        <ul className="space-y-1">
          {selectedIds.map((id) => (
            <li key={id} className="flex items-center justify-between bg-input rounded-lg px-3 py-2 text-sm">
              <span>{labelById.get(id) || id}</span>
              <div className="flex items-center gap-2">
                {statusById.has(id) && <StatusBadge t={t} status={statusById.get(id)!} />}
                <button onClick={() => toggle(id)} className="text-muted hover:text-red-500 text-sm">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('calendarInvite.searchPlaceholder')}
        className={inputCls}
      />
      <div className="max-h-44 overflow-y-auto border border-border rounded-lg divide-y divide-border">
        {filtered.length === 0 && (
          <p className="text-xs text-muted px-3 py-2">{t('calendarInvite.noCandidates')}</p>
        )}
        {filtered.map((c) => {
          const checked = selectedIds.includes(c.userId);
          return (
            <label key={c.userId} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-fg/5">
              <input type="checkbox" checked={checked} onChange={() => toggle(c.userId)} />
              <span className="flex-1">{c.fullName || c.username}</span>
              <span className="text-[10px] uppercase text-muted">
                {c.source === 'friend' ? t('calendarInvite.sourceFriend') : t('calendarInvite.sourceProject')}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">{t('calendarInvite.notifyHint')}</p>
    </div>
  );
}

function StatusBadge({ t, status }: { t: TFn; status: string }) {
  const map: Record<string, { cls: string; key: string }> = {
    INVITED: { cls: 'bg-amber-500/15 text-amber-500', key: 'calendarInvite.statusInvited' },
    ACCEPTED: { cls: 'bg-emerald-500/15 text-emerald-500', key: 'calendarInvite.statusAccepted' },
    DECLINED: { cls: 'bg-red-500/15 text-red-500', key: 'calendarInvite.statusDeclined' },
  };
  const m = map[status] || map.INVITED;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.cls}`}>{t(m.key)}</span>;
}

function InviteBanner({
  t, status, busy, onRespond,
}: {
  t: TFn;
  status: 'INVITED' | 'ACCEPTED' | 'DECLINED' | null;
  busy: boolean;
  onRespond: (s: 'ACCEPTED' | 'DECLINED') => void;
}) {
  const accepted = status === 'ACCEPTED';
  const declined = status === 'DECLINED';
  return (
    <div className={`rounded-lg border p-3 mb-3 space-y-2 ${
      accepted ? 'bg-emerald-500/10 border-emerald-500/40'
      : declined ? 'bg-red-500/10 border-red-500/40'
      : 'bg-blue-500/10 border-blue-500/40'
    }`}>
      <p className="text-sm font-medium">{t('calendarInvite.youAreInvited')}</p>
      <p className="text-xs text-muted">{t('calendarInvite.readOnlyHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onRespond('ACCEPTED')}
          className={`py-2 rounded-md text-sm border transition-colors disabled:opacity-50 ${
            accepted ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'border-border hover:border-fg/30'
          }`}
        >
          ✓ {t('calendarInvite.accept')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onRespond('DECLINED')}
          className={`py-2 rounded-md text-sm border transition-colors disabled:opacity-50 ${
            declined ? 'bg-red-500/20 border-red-500 text-red-500' : 'border-border hover:border-fg/30'
          }`}
        >
          ✕ {t('calendarInvite.decline')}
        </button>
      </div>
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

function AttendancePanel({
  status, note, busy, isPast, onChange, onNoteChange, onNoteBlur,
}: {
  status: AttendanceStatus;
  note: string;
  busy: boolean;
  isPast: boolean;
  onChange: (s: AttendanceStatus) => void;
  onNoteChange: (s: string) => void;
  onNoteBlur: () => void;
}) {
  const isAttended = status === 'ATTENDED' || status === 'AUTO_ATTENDED';
  const isMissed = status === 'MISSED';
  const isAuto = status === 'AUTO_ATTENDED';

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      isMissed ? 'bg-red-500/10 border-red-500/40'
      : isAttended ? (isAuto ? 'bg-amber-500/10 border-amber-500/40' : 'bg-emerald-500/10 border-emerald-500/40')
      : 'bg-elevated border-border'
    }`}>
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wide text-muted">
          Prezenta {isPast ? '' : '(va putea fi schimbata dupa ce trece evenimentul)'}
        </p>
        {isAuto && (
          <span className="text-[10px] text-amber-500">auto-bifat</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange('ATTENDED')}
          className={`py-2 rounded-md text-sm border transition-colors disabled:opacity-50 ${
            isAttended
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500'
              : 'border-border hover:border-fg/30'
          }`}
        >
          ✓ Am fost
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange('MISSED')}
          className={`py-2 rounded-md text-sm border transition-colors disabled:opacity-50 ${
            isMissed
              ? 'bg-red-500/20 border-red-500 text-red-500'
              : 'border-border hover:border-fg/30'
          }`}
        >
          ✕ Nu am fost
        </button>
      </div>
      {!isPast && status === 'PENDING' && (
        <p className="text-[11px] text-muted">
          Daca nu schimbi nimic, dupa ce trece evenimentul se bifeaza automat ca participat.
        </p>
      )}
      <textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        onBlur={onNoteBlur}
        placeholder="Nota (ce s-a discutat / motiv absentei)"
        rows={2}
        className={`${inputCls} resize-none text-sm`}
      />
    </div>
  );
}
