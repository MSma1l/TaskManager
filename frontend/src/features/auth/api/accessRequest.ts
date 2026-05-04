import client from '../../../shared/api/client';

export interface AccessRequestData {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  telegramChatId?: string;
  purpose: 'personal' | 'collective';
  reason?: string;
}

export const accessRequestApi = {
  submit: (data: AccessRequestData): Promise<{ id: string; status: string; message: string }> =>
    client.post('/access-requests', data).then((r) => r.data),
};
