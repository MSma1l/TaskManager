import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useMembers } from '../hooks/useMembers';
import { ProjectRole } from '../api/members';
import ManageMembersModal from './ManageMembersModal';

interface MembersBarProps {
  projectId: string;
  myRole?: ProjectRole;
}

const AVATAR_COLORS = [
  'bg-blue-600/20 text-blue-400',
  'bg-purple-600/20 text-purple-400',
  'bg-pink-600/20 text-pink-400',
  'bg-orange-600/20 text-orange-400',
  'bg-green-600/20 text-green-400',
  'bg-cyan-600/20 text-cyan-400',
];

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
              {shown.map((m, i) => (
                <div
                  key={m.userId}
                  title={`${m.fullName || m.username}${m.isYou ? ` (${t('members.youLabel')})` : ''}`}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 border-bg ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                >
                  {(m.fullName || m.username).charAt(0).toUpperCase()}
                </div>
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
