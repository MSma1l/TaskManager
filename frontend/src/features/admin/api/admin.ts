import client from '../../../shared/api/client';

export interface AdminUser {
  id: string;
  username: string;
  email?: string | null;
  fullName?: string | null;
  telegramChatId?: string | null;
  role: 'USER' | 'ADMIN';
  isActive: boolean;
  hasPin: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface CreateUserPayload {
  username: string;
  email?: string;
  fullName?: string;
  telegramChatId?: string;
  role?: 'USER' | 'ADMIN';
  pin?: string;
}

export interface UpdateUserPayload {
  email?: string | null;
  fullName?: string | null;
  telegramChatId?: string | null;
  role?: 'USER' | 'ADMIN';
  isActive?: boolean;
  pin?: string | null;
}

export interface LinkCodeResponse {
  code: string;
  expiresAt: string;
  instructions: string;
}

export interface UserStatsBlock {
  total: number;
  done?: number;
  past?: number;
  attended?: number;
  withNote?: number;
  upcoming?: number;
  skipped?: number;
  notDone?: number;
  pending?: number;
  donePercent?: number;
  attendedPercent?: number;
}

export interface UserStatRow {
  user: AdminUser;
  tasks: UserStatsBlock;
  meetings: UserStatsBlock;
}

export interface StatsOverview {
  windowDays: number;
  since: string;
  until: string;
  users: UserStatRow[];
}

export const adminApi = {
  listUsers: (): Promise<AdminUser[]> => client.get('/users').then((r) => r.data),
  createUser: (data: CreateUserPayload): Promise<AdminUser> =>
    client.post('/users', data).then((r) => r.data),
  updateUser: (id: string, data: UpdateUserPayload): Promise<AdminUser> =>
    client.put(`/users/${id}`, data).then((r) => r.data),
  deleteUser: (id: string) => client.delete(`/users/${id}`).then((r) => r.data),
  generateLinkCode: (id: string): Promise<LinkCodeResponse> =>
    client.post(`/users/${id}/link-code`).then((r) => r.data),
  statsOverview: (days = 7): Promise<StatsOverview> =>
    client.get(`/users/stats/overview?days=${days}`).then((r) => r.data),
  userStats: (id: string, days = 30): Promise<UserStatRow & { windowDays: number }> =>
    client.get(`/users/${id}/stats?days=${days}`).then((r) => r.data),

  // Access requests
  listAccessRequests: (status?: string): Promise<AccessRequestRow[]> =>
    client.get(`/access-requests${status ? `?status=${status}` : ''}`).then((r) => r.data),
  approveAccessRequest: (id: string, data: { username: string; role?: string; pin?: string }) =>
    client.post(`/access-requests/${id}/approve`, data).then((r) => r.data),
  rejectAccessRequest: (id: string, reason?: string) =>
    client.post(`/access-requests/${id}/reject`, { reason }).then((r) => r.data),
};

export interface AccessRequestRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  telegramChatId: string | null;
  purpose: 'personal' | 'collective';
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
  processedAt: string | null;
  createdUserId: string | null;
}
