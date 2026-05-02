import client from '../../../shared/api/client';

export interface LoginChallenge {
  challengeId: string;
  expiresAt: string;
  deliveredVia: 'telegram' | 'console';
  hint?: string;
}

export interface AuthSession {
  token: string;
  expiresAt?: string;
  role?: 'USER' | 'ADMIN';
  username?: string;
  userId?: string;
}

export interface MeResponse {
  id: string;
  username: string;
  email?: string;
  fullName?: string;
  role: 'USER' | 'ADMIN';
  telegramLinked: boolean;
  hasPin: boolean;
  lastLoginAt?: string;
  theme?: 'dark' | 'light';
  notificationSettings?: Record<string, unknown> | null;
}

export const authApi = {
  requestLoginCode: (username: string): Promise<LoginChallenge> =>
    client.post('/auth/login', { username }).then((r) => r.data),

  requestAdminLoginCode: (username: string): Promise<LoginChallenge> =>
    client.post('/auth/admin/login', { username }).then((r) => r.data),

  verifyCode: (challengeId: string, code: string): Promise<AuthSession> =>
    client.post('/auth/verify', { challengeId, code }).then((r) => r.data),

  refreshWithPin: (username: string, pin: string): Promise<AuthSession> =>
    client.post('/auth/refresh', { username, pin }).then((r) => r.data),

  me: (): Promise<MeResponse> => client.get('/auth/me').then((r) => r.data),

  updateMe: (data: {
    fullName?: string;
    email?: string;
    theme?: 'dark' | 'light';
    notificationSettings?: Record<string, unknown> | null;
  }): Promise<MeResponse> => client.put('/auth/me', data).then((r) => r.data),

  setPin: (pin: string) => client.put('/auth/pin', { pin }).then((r) => r.data),

  logout: () => client.post('/auth/logout').then((r) => r.data),
};
