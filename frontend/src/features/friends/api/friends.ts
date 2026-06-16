import client from '../../../shared/api/client';

export interface Friend {
  userId: string;
  username: string;
  fullName?: string | null;
  relation?: string;
}

export interface FriendRequest {
  id: string;
  username: string;
  fullName?: string | null;
  relation?: string;
}

export const friendsApi = {
  list: (): Promise<Friend[]> => client.get('/friends').then((r) => r.data),
  incoming: (): Promise<FriendRequest[]> => client.get('/friends/incoming').then((r) => r.data),
  outgoing: (): Promise<FriendRequest[]> => client.get('/friends/outgoing').then((r) => r.data),
  add: (username: string, relation: 'friend' | 'colleague' = 'colleague') =>
    client.post('/friends', { username, relation }).then((r) => r.data),
  accept: (id: string) => client.post(`/friends/${id}/accept`).then((r) => r.data),
  reject: (id: string) => client.post(`/friends/${id}/reject`).then((r) => r.data),
  remove: (friendUserId: string) => client.delete(`/friends/${friendUserId}`).then((r) => r.data),
};
