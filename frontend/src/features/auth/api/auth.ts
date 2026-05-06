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

export interface PublicConfig {
  telegramBotUsername: string | null;
  telegramRegisterDeepLink: string | null;
  telegramBotDeepLink: string | null;
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

  adminPasswordLogin: (username: string, password: string): Promise<AuthSession> =>
    client.post('/auth/admin/password-login', { username, password }).then((r) => r.data),

  /**
   * Combined login. Returns either a session (kind=session) OR a Telegram
   * challenge that still needs verification (kind=challenge).
   */
  passwordLogin: (
    username: string,
    password: string,
  ): Promise<
    | ({ kind: 'session' } & AuthSession)
    | ({ kind: 'challenge' } & LoginChallenge)
  > => client.post('/auth/password-login', { username, password }).then((r) => r.data),

  setAdminPassword: (password: string) =>
    client.put('/auth/admin/password', { password }).then((r) => r.data),

  setUserPassword: (password: string) =>
    client.put('/auth/password', { password }).then((r) => r.data),

  me: (): Promise<MeResponse> => client.get('/auth/me').then((r) => r.data),

  updateMe: (data: {
    fullName?: string;
    email?: string;
    theme?: 'dark' | 'light';
    notificationSettings?: Record<string, unknown> | null;
  }): Promise<MeResponse> => client.put('/auth/me', data).then((r) => r.data),

  setPin: (pin: string) => client.put('/auth/pin', { pin }).then((r) => r.data),

  publicConfig: (): Promise<PublicConfig> =>
    client.get('/auth/public-config').then((r) => r.data),

  // ── QR scan-to-login ──────────────────────────────────────────────────
  qrInit: (): Promise<{ qrId: string; expiresAt: string; ttlSeconds: number }> =>
    client.post('/auth/qr/init').then((r) => r.data),

  qrStatus: (qrId: string): Promise<
    | { status: 'PENDING' }
    | { status: 'EXPIRED' | 'CONSUMED' }
    | ({ status: 'APPROVED' } & AuthSession)
  > => client.get('/auth/qr/status', { params: { qrId } }).then((r) => r.data),

  qrConfirm: (qrId: string): Promise<{ ok: boolean; username: string; fullName: string | null }> =>
    client.post('/auth/qr/confirm', { qrId }).then((r) => r.data),

  // ── Telegram Mini App ─────────────────────────────────────────────────
  telegramWebappAuth: (initData: string): Promise<AuthSession> =>
    client.post('/auth/telegram-webapp', { initData }).then((r) => r.data),

  checkUsername: (username: string): Promise<{ available: boolean; reason?: string }> =>
    client.get('/auth/username-available', { params: { username } }).then((r) => r.data),

  updateUsername: (username: string): Promise<MeResponse> =>
    client.put('/auth/username', { username }).then((r) => r.data),

  generateMyLinkCode: (): Promise<{ code: string; expiresAt: string; instructions: string }> =>
    client.post('/auth/me/link-code').then((r) => r.data),

  unlinkTelegram: () => client.delete('/auth/me/telegram').then((r) => r.data),

  logout: () => client.post('/auth/logout').then((r) => r.data),
};
