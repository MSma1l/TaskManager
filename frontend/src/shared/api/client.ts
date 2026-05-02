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

        const onLoginPage = window.location.pathname.startsWith('/login')
          || window.location.pathname.startsWith('/admin_task_manager');
        if (!onLoginPage) {
          window.location.href = wasAdmin ? '/admin_task_manager' : '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;
