import { useState } from 'react';
import { useI18n } from '../../../shared/i18n/I18nProvider';
import { Subtask } from '../api/board';

interface SubtaskChecklistProps {
  subtasks: Subtask[];
  /** Adauga un subtask nou (undefined => read-only). */
  onAdd?: (title: string) => Promise<unknown> | void;
  onToggle?: (subtaskId: string, done: boolean) => Promise<unknown> | void;
  onRemove?: (subtaskId: string) => Promise<unknown> | void;
}

/** Checklist de subtaskuri cu bife, adaugare si stergere. */
export default function SubtaskChecklist({
  subtasks,
  onAdd,
  onToggle,
  onRemove,
}: SubtaskChecklistProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const list = subtasks ?? [];
  const doneCount = list.filter((s) => s.done).length;
  const readOnly = !onAdd && !onToggle && !onRemove;

  // Nimic de aratat daca nu sunt subtaskuri si nu se pot adauga.
  if (list.length === 0 && readOnly) return null;

  const handleAdd = async () => {
    const title = draft.trim();
    if (!title || !onAdd || adding) return;
    setAdding(true);
    try {
      await onAdd(title);
      setDraft('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-fg">{t('subtasks.title')}</span>
        {list.length > 0 && (
          <span className="text-xs text-muted">
            {doneCount}/{list.length}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {list.length > 0 && (
        <div className="h-1.5 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full bg-green-500/70 transition-all"
            style={{ width: `${list.length ? (doneCount / list.length) * 100 : 0}%` }}
          />
        </div>
      )}

      {/* Items */}
      {list.length > 0 && (
        <ul className="flex flex-col gap-1">
          {list.map((s) => (
            <li key={s.id} className="group flex items-center gap-2">
              <button
                type="button"
                disabled={!onToggle}
                onClick={() => onToggle?.(s.id, !s.done)}
                aria-label={s.done ? t('subtasks.markUndone') : t('subtasks.markDone')}
                className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
                  s.done
                    ? 'bg-green-600 border-green-600 text-white'
                    : 'bg-surface border-border hover:border-blue-500'
                } ${onToggle ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {s.done && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <span
                className={`flex-1 text-sm break-words ${
                  s.done ? 'line-through text-muted' : 'text-fg/90'
                }`}
              >
                {s.title}
              </span>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(s.id)}
                  aria-label={t('subtasks.remove')}
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-opacity flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Composer */}
      {onAdd && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
            placeholder={t('subtasks.addPlaceholder')}
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-sm text-fg outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draft.trim() || adding}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {t('subtasks.add')}
          </button>
        </div>
      )}
    </div>
  );
}
