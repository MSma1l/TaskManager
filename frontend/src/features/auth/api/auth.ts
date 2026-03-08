import client from '../../../shared/api/client';

export const authApi = {
  login: (pin: string) => client.post('/auth/login', { pin }).then((r) => r.data),
};
