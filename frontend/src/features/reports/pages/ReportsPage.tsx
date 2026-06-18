import { useT } from '../../../shared/i18n/I18nProvider';

/**
 * Rapoarte automate (sprint reports, burndown, user metrics).
 * Implementarea completă vine în Phase 3.
 */
export default function ReportsPage() {
  const t = useT();
  return (
    <div className="px-4 pt-5 max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-2">{t('nav.reports')}</h1>
      <p className="text-muted text-sm">{t('common.loading')}</p>
    </div>
  );
}
