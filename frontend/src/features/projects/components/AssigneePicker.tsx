import { useT } from '../../../shared/i18n/I18nProvider';
import { ProjectMember } from '../api/members';
import { avatarTint } from './boardConstants';

interface AssigneePickerProps {
  members: ProjectMember[];
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
}

export default function AssigneePicker({ members, value, onChange, disabled = false }: AssigneePickerProps) {
  const t = useT();

  return (
    <div className={`flex flex-wrap gap-2 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
          value === null
            ? 'bg-blue-600/20 border-blue-500 text-blue-300'
            : 'bg-surface border-border text-muted hover:text-fg'
        }`}
      >
        {t('board.unassigned')}
      </button>
      {members.map((m) => {
        const label = m.fullName || m.username;
        const active = value === m.userId;
        return (
          <button
            key={m.userId}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m.userId)}
            className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-lg text-sm border transition-colors ${
              active
                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                : 'bg-surface border-border text-muted hover:text-fg'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${avatarTint(m.userId)}`}>
              {label.charAt(0).toUpperCase()}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
