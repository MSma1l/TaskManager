import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/I18nProvider';
import { tasksApi } from '../../../features/tasks/api/tasks';
import { categoriesApi } from '../../../features/tasks/api/categories';

const DAY_WORDS: Record<string, number> = {
  luni: 1, marti: 2, marți: 2, miercuri: 3, joi: 4, vineri: 5, sambata: 6, sâmbătă: 6, duminica: 7, duminică: 7,
};

/** Parsare ușoară: extrage zi (azi/mâine/zi a săptămânii) + oră (HH:MM) din text. */
function parseQuickAdd(raw: string): { title: string; dayOfWeek: number; reminderTime?: string } {
  let text = ` ${raw.trim()} `;
  const today = new Date();
  const todayDow = today.getDay() === 0 ? 7 : today.getDay();
  let dayOfWeek = todayDow;
  let reminderTime: string | undefined;

  const time = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (time) {
    reminderTime = `${time[1].padStart(2, '0')}:${time[2]}`;
    text = text.replace(time[0], ' ');
  }
  if (/\bazi\b/i.test(text)) { dayOfWeek = todayDow; text = text.replace(/\bazi\b/i, ' '); }
  else if (/\b(maine|mâine)\b/i.test(text)) { dayOfWeek = (todayDow % 7) + 1; text = text.replace(/\b(maine|mâine)\b/i, ' '); }
  else {
    for (const [w, d] of Object.entries(DAY_WORDS)) {
      const re = new RegExp(`\\b${w}\\b`, 'i');
      if (re.test(text)) { dayOfWeek = d; text = text.replace(re, ' '); break; }
    }
  }
  return { title: text.replace(/\s+/g, ' ').trim(), dayOfWeek, reminderTime };
}

/** Buton global „+ adaugă rapid": creează un task personal din limbaj natural. */
export default function QuickAddFab() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [catId, setCatId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    categoriesApi.getAll()
      .then((cats) => setCatId(cats.find((c) => c.id === 'cat-personal')?.id || cats[0]?.id || null))
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  const submit = async () => {
    const parsed = parseQuickAdd(val);
    if (!parsed.title || !catId) return;
    setBusy(true);
    try {
      await tasksApi.create({
        title: parsed.title,
        categoryId: catId,
        dayOfWeek: parsed.dayOfWeek,
        reminderTime: parsed.reminderTime,
      });
      setVal('');
      setOk(true);
      setTimeout(() => { setOk(false); setOpen(false); }, 900);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('quickAdd.title')}
        className="fixed z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30 flex items-center justify-center text-3xl leading-none"
        style={{ right: '1rem', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.2rem)' }}
      >
        +
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-elevated border border-border rounded-2xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-fg mb-1">{t('quickAdd.title')}</h3>
            <p className="text-xs text-muted mb-3">{t('quickAdd.hint')}</p>
            <input
              ref={inputRef}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder={t('quickAdd.placeholder')}
              className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-fg outline-none focus:border-blue-500"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-lg bg-surface border border-border text-fg text-sm">
                {t('common.cancel')}
              </button>
              <button onClick={submit} disabled={busy || !val.trim()} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50">
                {ok ? '✓' : busy ? t('common.saving') : t('common.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
