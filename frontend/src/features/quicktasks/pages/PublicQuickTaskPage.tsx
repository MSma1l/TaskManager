import { useT } from '../../../shared/i18n/I18nProvider';

/**
 * Formular public de creare task rapid (FĂRĂ login).
 * Implementarea completă (nume, titlu, descriere, prioritate) vine în Phase 2.
 */
export default function PublicQuickTaskPage() {
  const t = useT();
  return (
    <div className="min-h-screen bg-bg text-fg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight mb-2">{t('nav.quickTasks')}</h1>
        <p className="text-muted text-sm">{t('common.loading')}</p>
      </div>
    </div>
  );
}
