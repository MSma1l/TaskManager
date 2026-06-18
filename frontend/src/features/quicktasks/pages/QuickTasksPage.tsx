import { useT } from '../../../shared/i18n/I18nProvider';

/**
 * Inbox-ul de Quick Tasks pentru admini (task-uri rapide trimise public).
 * Implementarea completa (lista, asignare la proiect/persoana) vine in Phase 2.
 */
export default function QuickTasksPage() {
  const t = useT();
  return (
    <div className="px-4 pt-5 max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-2">{t('nav.quickTasks')}</h1>
      <p className="text-muted text-sm">{t('common.loading')}</p>
    </div>
  );
}
