import client from '../../../shared/api/client';

export type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

/** Roles that can be assigned when inviting / changing (OWNER is implicit, set by transfer only). */
export type AssignableRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface ProjectMember {
  userId: string;
  username: string;
  fullName: string | null;
  role: ProjectRole;
  isYou: boolean;
  capacityPoints: number;
}

export interface InviteMemberData {
  username: string;
  role: AssignableRole;
}

export const membersApi = {
  list: (projectId: string) =>
    client.get<ProjectMember[]>(`/projects/${projectId}/members`).then((r) => r.data),
  invite: (projectId: string, data: InviteMemberData) =>
    client.post<ProjectMember>(`/projects/${projectId}/members`, data).then((r) => r.data),
  updateRole: (projectId: string, userId: string, role: AssignableRole) =>
    client
      .put<ProjectMember>(`/projects/${projectId}/members/${userId}`, { role })
      .then((r) => r.data),
  updateCapacity: (projectId: string, userId: string, capacityPoints: number) =>
    client
      .put<ProjectMember>(`/projects/${projectId}/members/${userId}`, { capacityPoints })
      .then((r) => r.data),
  remove: (projectId: string, userId: string) =>
    client.delete(`/projects/${projectId}/members/${userId}`).then((r) => r.data),
};
