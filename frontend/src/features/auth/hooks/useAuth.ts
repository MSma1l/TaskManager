import { useCallback, useEffect, useState } from 'react';
import { authApi, AuthSession } from '../api/auth';

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  role: 'USER' | 'ADMIN' | null;
  expiresAt: number | null; // ms epoch
}

function readState(): AuthState {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');
  const role = localStorage.getItem('userRole') as 'USER' | 'ADMIN' | null;
  const exp = localStorage.getItem('tokenExpiresAt');
  return {
    isAuthenticated: !!token,
    username,
    role,
    expiresAt: exp ? parseInt(exp, 10) : null,
  };
}

function writeSession(session: AuthSession) {
  localStorage.setItem('token', session.token);
  if (session.username) localStorage.setItem('username', session.username);
  if (session.role) localStorage.setItem('userRole', session.role);
  if (session.expiresAt) {
    const ms = new Date(session.expiresAt).getTime();
    localStorage.setItem('tokenExpiresAt', String(ms));
  }
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('tokenExpiresAt');
  // Keep username + role so we can pre-fill the re-login screen
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(readState);

  useEffect(() => {
    const refresh = () => setState(readState());
    window.addEventListener('auth:expired', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('auth:expired', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const verifyCode = useCallback(async (challengeId: string, code: string): Promise<boolean> => {
    try {
      const session = await authApi.verifyCode(challengeId, code);
      writeSession(session);
      setState(readState());
      return true;
    } catch {
      return false;
    }
  }, []);

  const refreshWithPin = useCallback(async (username: string, pin: string): Promise<boolean> => {
    try {
      const session = await authApi.refreshWithPin(username, pin);
      writeSession(session);
      setState(readState());
      return true;
    } catch {
      return false;
    }
  }, []);

  const adminPasswordLogin = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const session = await authApi.adminPasswordLogin(username, password);
      writeSession(session);
      setState(readState());
      return true;
    } catch {
      return false;
    }
  }, []);

  const consumeSession = useCallback((session: AuthSession) => {
    writeSession(session);
    setState(readState());
  }, []);

  const logout = useCallback(() => {
    clearSession();
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    setState(readState());
  }, []);

  return {
    ...state,
    isAdmin: state.role === 'ADMIN',
    verifyCode,
    refreshWithPin,
    adminPasswordLogin,
    consumeSession,
    logout,
  };
}
