import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useMembers } from '../hooks/useMembers';
import { ProjectRole } from '../api/members';
import ManageMembersModal from './ManageMembersModal';
import UserAvatar from '../../../shared/components/UserAvatar';

interface MembersBarProps {
  projectId: string;
  myRole?: ProjectRole;
}

export default function MembersBar({ projectId, myRole }: MembersBarProps) {
  const t = useT();
  const { members, loading } = useMembers(projectId);
  const [showManage, setShowManage] = useState(false);

  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';
  const shown = members.slice(0, 5);
  const extra = members.length - shown.length;

  return (
    <>
      <div className="flex items-center gap-3">
        {!loading && members.length > 0 && (
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {shown.map((m) => (
                <UserAvatar
                  key={m.userId}
                  avatarUrl={m.avatarUrl}
                  name={m.fullName || m.username}
                  seed={m.userId}
                  size={32}
                  title={`${m.fullName || m.username}${m.isYou ? ` (${t('members.youLabel')})` : ''}`}
                  className="border-2 border-bg"
                />
              ))}
              {extra > 0 && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-bg bg-surface text-muted">
                  +{extra}
                </div>
              )}
            </div>
            <span className="ml-2.5 text-xs text-muted">
              {members.length} {t('members.memberCount')}
            </span>
          </div>
        )}

        {canManage && (
          <button
            onClick={() => setShowManage(true)}
            className="px-3 py-2 rounded-xl bg-surface hover:bg-elevated border border-border text-sm text-fg transition-all duration-200 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-1-7.87" />
            </svg>
            {t('members.manage')}
          </button>
        )}
      </div>

      {showManage && (
        <ManageMembersModal
          projectId={projectId}
          myRole={myRole}
          onClose={() => setShowManage(false)}
        />
      )}
    </>
  );
}
