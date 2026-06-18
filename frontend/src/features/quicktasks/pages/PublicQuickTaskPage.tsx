import { FormEvent, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { QuickTaskPriority, quickTasksApi } from '../api/quicktasks';

const PRIORITIES: { value: QuickTaskPriority; labelKey: string; dot: string }[] = [
  { value: 'URGENT', labelKey: 'quick.priorityUrgent', dot: 'bg-red-500' },
  { value: 'NORMAL', labelKey: 'quick.priorityNormal', dot: 'bg-amber-500' },
  { value: 'LATER', labelKey: 'quick.priorityLater', dot: 'bg-slate-400' },
];

/**
 * Formular public de creare task rapid (FARA login).
 * Nume+Prenume, Titlu, Descriere, Prioritate. Statusul e implicit "Nou".
 */
export default function PublicQuickTaskPage() {
  const t = useT();
  const [requesterName, setRequesterName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<QuickTaskPriority>('NORMAL');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!requesterName.trim() || !title.trim()) {
      setError(t('quick.errorRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await quickTasksApi.submitPublic({
        requesterName: requesterName.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
      });
      setDone(true);
    } catch {
      setError(t('quick.errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setRequesterName('');
    setTitle('');
    setDescription('');
    setPriority('NORMAL');
    setDone(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-bg text-fg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {done ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-3xl">
              ✓
            </div>
            <h1 className="text-xl font-bold tracking-tight mb-2">{t('quick.successTitle')}</h1>
            <p className="text-muted text-sm mb-6">{t('quick.successBody')}</p>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              {t('quick.submitAnother')}
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm"
          >
            <h1 className="text-2xl font-bold tracking-tight mb-1">{t('quick.publicTitle')}</h1>
            <p className="text-muted text-sm mb-6">{t('quick.publicSubtitle')}</p>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {error}
              </div>
            )}

            <label className="block mb-4">
              <span className="block text-sm font-medium mb-1.5">{t('quick.nameLabel')}</span>
              <input
                type="text"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder={t('quick.namePlaceholder')}
                className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                maxLength={150}
              />
            </label>

            <label className="block mb-4">
              <span className="block text-sm font-medium mb-1.5">{t('quick.titleLabel')}</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('quick.titlePlaceholder')}
                className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                maxLength={300}
              />
            </label>

            <label className="block mb-4">
              <span className="block text-sm font-medium mb-1.5">{t('quick.descriptionLabel')}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('quick.descriptionPlaceholder')}
                rows={4}
                className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y"
              />
            </label>

            <fieldset className="mb-6">
              <legend className="block text-sm font-medium mb-1.5">{t('quick.priorityLabel')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITIES.map((p) => {
                  const active = priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        active
                          ? 'border-blue-500 bg-blue-500/10 text-fg'
                          : 'border-border bg-elevated text-muted hover:text-fg'
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
                      {t(p.labelKey)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? t('quick.submitting') : t('quick.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
