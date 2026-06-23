import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url: string = (error.config?.url || '') as string;
      // Don't redirect during the login dance itself
      const isAuthCall = url.includes('/auth/login') || url.includes('/auth/verify') || url.includes('/auth/refresh');

      if (!isAuthCall) {
        const wasAdmin = localStorage.getItem('userRole') === 'ADMIN';
        const lastUsername = localStorage.getItem('username') || '';
        localStorage.removeItem('token');
        localStorage.removeItem('tokenExpiresAt');

        // Notify the app — useAuth listens and shows a "session expired" modal
        window.dispatchEvent(new CustomEvent('auth:expired', { detail: { username: lastUsername } }));

        // Only the EXACT login routes count as "already on a login page".
        // Deeper admin paths (ex: /admin_task_manager/dashboard) sunt pagini reale,
        // nu login — deci trebuie redirecționate.
        const pathname = window.location.pathname;
        const onLoginPage = pathname === '/login' || pathname === '/admin_task_manager';
        if (!onLoginPage) {
          window.location.href = wasAdmin ? '/admin_task_manager' : '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;
