import { useI18n } from './I18nProvider';
import { Lang } from './dictionary';

/**
 * Shown on the very first launch when the user hasn't picked a language
 * yet. Once the user clicks one of the buttons, `picked` becomes true and
 * the modal stays hidden forever (unless localStorage is cleared).
 */
export default function LanguagePickerModal() {
  const { picked, setLang, t } = useI18n();
  if (picked) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl">
        <div className="text-center mb-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600 flex items-center justify-center mb-3 text-white text-2xl font-bold shadow-lg">
            🌍
          </div>
          <h2 className="text-xl font-bold text-white">{t('langPicker.title')}</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {t('langPicker.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <LangButton lang="ro" onClick={() => setLang('ro')}>
            🇷🇴 Romana
          </LangButton>
          <LangButton lang="ru" onClick={() => setLang('ru')}>
            🇷🇺 Русский
          </LangButton>
        </div>
      </div>
    </div>
  );
}

function LangButton({
  lang, children, onClick,
}: { lang: Lang; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-lang={lang}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-700/60 hover:bg-blue-600 border border-slate-600 hover:border-blue-500 text-white text-base font-medium transition-all duration-150 active:scale-[0.99]"
    >
      <span>{children}</span>
      <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
