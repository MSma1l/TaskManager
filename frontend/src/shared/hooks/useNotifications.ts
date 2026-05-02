import { useEffect, useRef, useCallback } from 'react';
import client from '../api/client';

interface PendingNotification {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  categoryIcon: string | null;
  priority: string;
  reminderTime: string;
}

interface PendingCalendarNotification {
  id: string;
  title: string;
  type: string;
  typeLabel: string;
  occurrenceDate: string;
  startTime: string;
  endTime: string;
  minutesBefore: number;
  location: string | null;
  meetingUrl: string | null;
  description: string | null;
  color: string | null;
}

function requestPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showTaskNotification(notif: PendingNotification) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const icon = notif.categoryIcon || undefined;
  const body = [
    notif.description,
    notif.category ? `Categorie: ${icon ? icon + ' ' : ''}${notif.category}` : null,
    notif.priority !== 'MEDIUM' ? `Prioritate: ${notif.priority}` : null,
  ].filter(Boolean).join('\n');

  const n = new Notification(`Reminder: ${notif.title}`, {
    body: body || `Task programat la ${notif.reminderTime}`,
    tag: `task-${notif.id}`,
    requireInteraction: true,
  });
  n.onclick = () => { window.focus(); n.close(); };
}

function showCalendarNotification(notif: PendingCalendarNotification) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const whenLabel = notif.minutesBefore === 0
    ? 'incepe ACUM'
    : notif.minutesBefore < 60
      ? `in ${notif.minutesBefore} min`
      : notif.minutesBefore % 60 === 0
        ? `in ${notif.minutesBefore / 60}h`
        : `in ${notif.minutesBefore} min`;

  const lines = [
    `${notif.startTime}–${notif.endTime}`,
    notif.location ? `📍 ${notif.location}` : null,
    notif.meetingUrl ? `🔗 ${notif.meetingUrl}` : null,
    notif.description ? notif.description.slice(0, 200) : null,
  ].filter(Boolean);

  const n = new Notification(`${notif.typeLabel}: ${notif.title} (${whenLabel})`, {
    body: lines.join('\n'),
    tag: notif.id,
    requireInteraction: true,
  });
  n.onclick = () => {
    window.focus();
    n.close();
    if (notif.meetingUrl) window.open(notif.meetingUrl, '_blank');
  };
}

export function useNotifications() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNotifications = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const [tasks, events] = await Promise.allSettled([
        client.get<PendingNotification[]>('/notifications/pending'),
        client.get<PendingCalendarNotification[]>('/notifications/calendar-pending'),
      ]);
      if (tasks.status === 'fulfilled') {
        for (const notif of tasks.value.data) showTaskNotification(notif);
      }
      if (events.status === 'fulfilled') {
        for (const notif of events.value.data) showCalendarNotification(notif);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    requestPermission();
    checkNotifications();
    intervalRef.current = setInterval(checkNotifications, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [checkNotifications]);
}
