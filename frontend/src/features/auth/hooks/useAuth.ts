import { useState, useCallback } from 'react';
import client from '../../../shared/api/client';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('token'));

  const login = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const res = await client.post('/auth/login', { pin });
      localStorage.setItem('token', res.data.token);
      setIsAuthenticated(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, login, logout };
}
