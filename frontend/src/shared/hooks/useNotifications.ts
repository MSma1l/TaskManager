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

function requestPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showBrowserNotification(notif: PendingNotification) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const icon = notif.categoryIcon || undefined;
  const body = [
    notif.description,
    notif.category ? `Categorie: ${icon ? icon + ' ' : ''}${notif.category}` : null,
    notif.priority !== 'MEDIUM' ? `Prioritate: ${notif.priority}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const n = new Notification(`Reminder: ${notif.title}`, {
    body: body || `Task programat la ${notif.reminderTime}`,
    tag: `task-${notif.id}`,
    requireInteraction: true,
  });

  n.onclick = () => {
    window.focus();
    n.close();
  };
}

export function useNotifications() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNotifications = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const { data } = await client.get<PendingNotification[]>('/notifications/pending');
      for (const notif of data) {
        showBrowserNotification(notif);
      }
    } catch {
      // ignore - user might not be logged in
    }
  }, []);

  useEffect(() => {
    requestPermission();

    // Check immediately
    checkNotifications();

    // Poll every 30 seconds
    intervalRef.current = setInterval(checkNotifications, 30_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkNotifications]);
}
