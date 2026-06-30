import client from '../../../shared/api/client';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  meta?: Record<string, unknown> | null;
  priority?: 'STANDARD' | 'URGENT';
  isRead: boolean;
  createdAt?: string | null;
  readAt?: string | null;
}

export const notificationsApi = {
  list: (unread = false): Promise<AppNotification[]> =>
    client.get('/notifications', { params: unread ? { unread: true } : {} }).then((r) => r.data),
  unreadCount: (): Promise<{ count: number }> =>
    client.get('/notifications/unread-count').then((r) => r.data),
  markRead: (id: string) => client.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => client.post('/notifications/read-all').then((r) => r.data),
};
