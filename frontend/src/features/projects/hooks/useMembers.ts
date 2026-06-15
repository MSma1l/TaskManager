import { useState, useEffect, useCallback } from 'react';
import { ProjectMember, AssignableRole, InviteMemberData, membersApi } from '../api/members';

export function useMembers(projectId: string) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await membersApi.list(projectId);
      setMembers(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetch(); }, [fetch]);

  const invite = async (data: InviteMemberData) => {
    const member = await membersApi.invite(projectId, data);
    await fetch();
    return member;
  };

  const updateRole = async (userId: string, role: AssignableRole) => {
    const member = await membersApi.updateRole(projectId, userId, role);
    await fetch();
    return member;
  };

  const remove = async (userId: string) => {
    await membersApi.remove(projectId, userId);
    await fetch();
  };

  return { members, loading, refetch: fetch, invite, updateRole, remove };
}
