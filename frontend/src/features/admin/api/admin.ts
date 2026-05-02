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

export const adminApi = {
  listUsers: (): Promise<AdminUser[]> => client.get('/users').then((r) => r.data),
  createUser: (data: CreateUserPayload): Promise<AdminUser> =>
    client.post('/users', data).then((r) => r.data),
  updateUser: (id: string, data: UpdateUserPayload): Promise<AdminUser> =>
    client.put(`/users/${id}`, data).then((r) => r.data),
  deleteUser: (id: string) => client.delete(`/users/${id}`).then((r) => r.data),
  generateLinkCode: (id: string): Promise<LinkCodeResponse> =>
    client.post(`/users/${id}/link-code`).then((r) => r.data),
};
