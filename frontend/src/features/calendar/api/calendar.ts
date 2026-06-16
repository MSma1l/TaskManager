import client from '../../../shared/api/client';

export type EventType =
  | 'personal'
  | 'meeting_online'
  | 'meeting_in_person'
  | 'appointment'
  | 'reminder'
  | 'task';

export type RecurrenceRule = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
export type AttendanceStatus = 'PENDING' | 'ATTENDED' | 'AUTO_ATTENDED' | 'MISSED';

export interface Attendee {
  name: string;
  email?: string | null;
  telegramChatId?: string | null;
}

export type AttendeeStatus = 'INVITED' | 'ACCEPTED' | 'DECLINED';

// Participant real (utilizator al aplicatiei) invitat la eveniment
export interface EventParticipant {
  userId: string;
  username: string | null;
  fullName: string | null;
  status: AttendeeStatus;
}

// Utilizator candidat la invitatie (colaborator sau co-membru de proiect)
export interface InviteCandidate {
  userId: string;
  username: string | null;
  fullName: string | null;
  source: 'friend' | 'project';
}

// Task de board atribuit, afisat in calendar (read-only)
export interface CalendarTaskItem {
  id: string;
  taskId: string;
  kind: 'task';
  title: string;
  projectId: string | null;
  priority: string;
  eventDate: string;
  startTime: string;
  isDue: boolean;
}

export interface CalendarEvent {
  id: string;            // virtual id for recurring instances ("masterId::date")
  masterId: string;
  title: string;
  description: string | null;
  color: string;
  eventType: EventType;
  location: string | null;
  meetingUrl: string | null;
  isAllDay: boolean;
  eventStatus: EventStatus;
  attendanceStatus: AttendanceStatus;
  attendanceNote: string | null;
  recurrenceRule: RecurrenceRule | null;
  recurrenceUntil: string | null;
  reminderMinutes: number[];
  attendees: Attendee[];
  // Participanti reali (utilizatori) + flag-uri owner/invitat
  ownerId: string;
  isOwner: boolean;
  myAttendance: AttendeeStatus | null;
  participants: EventParticipant[];
  categoryId: string | null;
  eventDate: string;          // occurrence date
  originalDate: string | null;
  isRecurringInstance: boolean;
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventData {
  title: string;
  description?: string;
  color?: string;
  eventType?: EventType;
  location?: string;
  meetingUrl?: string;
  isAllDay?: boolean;
  eventStatus?: EventStatus;
  recurrenceRule?: RecurrenceRule | null;
  recurrenceUntil?: string | null;
  reminderMinutes?: number[];
  attendees?: Attendee[];
  // Id-uri de utilizatori invitati ca participanti reali
  participantIds?: string[];
  categoryId?: string | null;
  eventDate: string;
  startTime: string;
  endTime: string;
}

export type UpdateEventData = Partial<CreateEventData>;

export interface EventCategory {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  isVisible: boolean;
  isDefault: boolean;
  sortOrder: string | null;
  createdAt: string;
}

export const calendarApi = {
  getEvents: (start: string, end: string) =>
    client.get<CalendarEvent[]>(`/calendar/events?start=${start}&end=${end}`).then((r) => r.data),

  createEvent: (data: CreateEventData) =>
    client.post<CalendarEvent>('/calendar/events', data).then((r) => r.data),

  updateEvent: (id: string, data: UpdateEventData) =>
    client.put<CalendarEvent>(`/calendar/events/${id}`, data).then((r) => r.data),

  deleteEvent: (id: string) =>
    client.delete(`/calendar/events/${id}`).then((r) => r.data),

  getCategories: () =>
    client.get<EventCategory[]>('/calendar/categories').then((r) => r.data),

  createCategory: (data: { name: string; color?: string; icon?: string; isVisible?: boolean }) =>
    client.post<EventCategory>('/calendar/categories', data).then((r) => r.data),

  updateCategory: (id: string, data: Partial<{ name: string; color: string; icon: string; isVisible: boolean }>) =>
    client.put<EventCategory>(`/calendar/categories/${id}`, data).then((r) => r.data),

  deleteCategory: (id: string) =>
    client.delete(`/calendar/categories/${id}`).then((r) => r.data),

  setAttendance: (eventId: string, status: AttendanceStatus, note?: string | null) =>
    client.put<CalendarEvent>(`/calendar/events/${eventId}/attendance`, { status, note }).then((r) => r.data),

  // ── Participanti reali ───────────────────────────────────────────────
  getInviteCandidates: () =>
    client.get<InviteCandidate[]>('/calendar/invite-candidates').then((r) => r.data),

  respondInvite: (eventId: string, status: Exclude<AttendeeStatus, 'INVITED'>) =>
    client.put<{ eventId: string; status: AttendeeStatus }>(
      `/calendar/events/${eventId}/invite-response`, { status },
    ).then((r) => r.data),

  // Taskuri de board atribuite, cu data, ca items read-only in calendar
  getTaskItems: (start: string, end: string) =>
    client.get<CalendarTaskItem[]>(`/calendar/task-items?start=${start}&end=${end}`).then((r) => r.data),
};
