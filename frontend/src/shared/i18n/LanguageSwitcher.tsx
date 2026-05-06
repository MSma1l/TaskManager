import { useI18n } from './I18nProvider';

interface Props {
  /** When true, render a tiny pill-style switcher (for tight headers) */
  compact?: boolean;
  /** Override Tailwind classes for theming inside Telegram Mini App */
  className?: string;
}

/**
 * Two-state pill: RO | RU. Click toggles. Used in the LoginPage banner,
 * the ForcedSetupModal, and the MiniApp dashboard header.
 */
export default function LanguageSwitcher({ compact, className }: Props) {
  const { lang, setLang } = useI18n();

  return (
    <div
      className={`inline-flex items-center bg-slate-800/80 border border-slate-700 rounded-full p-0.5 ${className || ''}`}
      role="group"
      aria-label="Language"
    >
      <Btn active={lang === 'ro'} onClick={() => setLang('ro')} compact={compact}>RO</Btn>
      <Btn active={lang === 'ru'} onClick={() => setLang('ru')} compact={compact}>RU</Btn>
    </div>
  );
}

function Btn({
  active, onClick, children, compact,
}: { active: boolean; onClick: () => void; children: React.ReactNode; compact?: boolean }) {
  const sizes = compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${sizes} font-bold rounded-full transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
