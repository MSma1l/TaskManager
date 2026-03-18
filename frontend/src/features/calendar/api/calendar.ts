import client from '../../../shared/api/client';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  color: string;
  eventDate: string;   // "2026-03-18"
  startTime: string;   // "08:00"
  endTime: string;     // "09:30"
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventData {
  title: string;
  description?: string;
  color?: string;
  eventDate: string;
  startTime: string;
  endTime: string;
}

export interface UpdateEventData {
  title?: string;
  description?: string;
  color?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
}

export const calendarApi = {
  getEvents: (start: string, end: string) =>
    client.get<CalendarEvent[]>(`/calendar/events?start=${start}&end=${end}`).then(r => r.data),

  createEvent: (data: CreateEventData) =>
    client.post<CalendarEvent>('/calendar/events', data).then(r => r.data),

  updateEvent: (id: string, data: UpdateEventData) =>
    client.put<CalendarEvent>(`/calendar/events/${id}`, data).then(r => r.data),

  deleteEvent: (id: string) =>
    client.delete(`/calendar/events/${id}`).then(r => r.data),
};
