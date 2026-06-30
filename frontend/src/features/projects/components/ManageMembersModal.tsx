import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useMembers } from '../hooks/useMembers';
import { AssignableRole, ProjectRole, ProjectMember } from '../api/members';
import { friendsApi, Friend } from '../../friends/api/friends';
import UserAvatar from '../../../shared/components/UserAvatar';

interface ManageMembersModalProps {
  projectId: string;
  myRole?: ProjectRole;
  onClose: () => void;
}

const ASSIGNABLE_ROLES: AssignableRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];

function roleKey(role: ProjectRole): string {
  switch (role) {
    case 'OWNER': return 'members.roleOwner';
    case 'ADMIN': return 'members.roleAdmin';
    case 'MEMBER': return 'members.roleMember';
    case 'VIEWER': return 'members.roleViewer';
  }
}

export default function ManageMembersModal({ projectId, myRole, onClose }: ManageMembersModalProps) {
  const t = useT();
  const { members, invite, updateRole, updateCapacity, remove } = useMembers(projectId);

  const [username, setUsername] = useState('');
  const [role, setRole] = useState<AssignableRole>('MEMBER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  /** Local draft of capacity inputs keyed by userId (committed on blur). */
  const [capacityDraft, setCapacityDraft] = useState<Record<string, string>>({});

  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';
  const canEditRoles = myRole === 'OWNER';
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';

  // Colaboratori (prieteni/colegi) pentru quick-pick la adaugare.
  const [friends, setFriends] = useState<Friend[]>([]);
  useEffect(() => {
    if (canManage) friendsApi.list().then(setFriends).catch(() => { /* ignore */ });
  }, [canManage]);
  const memberUsernames = new Set(members.map((m) => m.username));
  const pickableFriends = friends.filter((f) => !memberUsernames.has(f.username));

  const errorFor = (e: unknown): string => {
    const status = (e as AxiosError)?.response?.status;
    if (status === 404) return t('members.errorUserNotFound');
    if (status === 409) return t('members.errorAlreadyMember');
    if (status === 400) return t('members.errorLastOwner');
    return t('members.errorGeneric');
  };

  const handleInvite = async () => {
    const u = username.trim();
    if (!u) return;
    setError('');
    setLoading(true);
    try {
      await invite({ username: u, role });
      setUsername('');
      setRole('MEMBER');
    } catch (e) {
      setError(errorFor(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (m: ProjectMember, newRole: AssignableRole) => {
    setError('');
    try {
      await updateRole(m.userId, newRole);
    } catch (e) {
      setError(errorFor(e));
    }
  };

  const handleCapacityCommit = async (m: ProjectMember) => {
    const raw = capacityDraft[m.userId];
    if (raw === undefined) return;
    const value = parseInt(raw, 10);
    setCapacityDraft((prev) => {
      const next = { ...prev };
      delete next[m.userId];
      return next;
    });
    if (!Number.isFinite(value) || value < 0 || value === m.capacityPoints) return;
    setError('');
    try {
      await updateCapacity(m.userId, value);
    } catch (e) {
      setError(errorFor(e));
    }
  };

  const handleRemove = async (m: ProjectMember) => {
    setError('');
    try {
      await remove(m.userId);
      setConfirmRemove(null);
    } catch (e) {
      setError(errorFor(e));
      setConfirmRemove(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-elevated rounded-2xl p-6 w-full max-w-md border border-border max-h-[85vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4 text-fg">{t('members.manageMembers')}</h3>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Members list */}
        <div className="flex flex-col gap-2 mb-5">
          {members.length === 0 ? (
            <p className="text-sm text-muted">{t('members.noMembers')}</p>
          ) : (
            members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface border border-border"
              >
                <UserAvatar
                  avatarUrl={m.avatarUrl}
                  name={m.fullName || m.username}
                  seed={m.userId}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg truncate">
                    {m.fullName || m.username}
                    {m.isYou && <span className="ml-1.5 text-xs text-muted">({t('members.youLabel')})</span>}
                  </p>
                  <p className="text-xs text-muted truncate">@{m.username}</p>
                </div>

                {/* Capacity (points): editable by admin or self, otherwise read-only */}
                {isAdmin || m.isYou ? (
                  <div className="flex items-center gap-1 flex-shrink-0" title={t('pm.capacity')}>
                    <input
                      type="number"
                      min={0}
                      value={capacityDraft[m.userId] ?? String(m.capacityPoints)}
                      onChange={(e) => setCapacityDraft((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                      onBlur={() => handleCapacityCommit(m)}
                      className="w-14 text-xs px-2 py-1 rounded-lg bg-bg border border-border text-fg text-center outline-none focus:border-blue-500 transition-colors"
                    />
                    <span className="text-[10px] text-muted">{t('pm.points')}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted flex-shrink-0" title={t('pm.capacity')}>
                    {m.capacityPoints} {t('pm.points')}
                  </span>
                )}

                {/* Role: editable by OWNER (except OWNER rows), otherwise badge */}
                {canEditRoles && m.role !== 'OWNER' ? (
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m, e.target.value as AssignableRole)}
                    className="text-xs px-2 py-1 rounded-lg bg-bg border border-border text-fg outline-none focus:border-blue-500 transition-colors"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>{t(roleKey(r))}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-bg text-muted border border-border flex-shrink-0">
                    {t(roleKey(m.role))}
                  </span>
                )}

                {canEditRoles && m.role !== 'OWNER' && !m.isYou && (
                  confirmRemove === m.userId ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRemove(m)}
                        className="text-xs text-red-400 font-semibold hover:text-red-300"
                      >
                        {t('common.confirm')}
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="text-xs text-muted hover:text-fg"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(m.userId)}
                      title={t('members.removeMember')}
                      className="text-red-400/60 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )
                )}
              </div>
            ))
          )}
        </div>

        {/* Invite */}
        {canManage && (
          <div className="border-t border-border pt-4">
            {/* Quick-pick din colaboratori (prieteni/colegi) */}
            {pickableFriends.length > 0 && (
              <div className="mb-3">
                <label className="text-xs text-muted mb-1.5 block">{t('members.fromCollaborators')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {pickableFriends.map((f) => (
                    <button
                      key={f.userId}
                      type="button"
                      onClick={() => { setUsername(f.username); setError(''); }}
                      className="px-2.5 py-1 rounded-full text-xs bg-surface border border-border text-fg hover:border-blue-500 transition-colors"
                    >
                      @{f.username}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="text-sm text-fg mb-2 block font-medium">{t('members.inviteByUsername')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
                placeholder={t('members.usernamePlaceholder')}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
                className="px-2 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{t(roleKey(r))}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleInvite}
              disabled={loading || !username.trim()}
              className="w-full mt-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-blue-600/20"
            >
              {loading ? t('common.saving') : t('members.invite')}
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
