import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n/I18nProvider';
import { searchApi, SearchResults } from '../../api/search';

const EMPTY: SearchResults = { projects: [], tasks: [], events: [] };

/**
 * Căutare globală (Cmd/Ctrl+K). Caută proiecte, taskuri (personale + de board
 * atribuite) și evenimente; navighează la rezultat. Debounce 200ms.
 */
export default function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResults>(EMPTY);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Open with Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ(''); setRes(EMPTY); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setRes(EMPTY); return; }
    const id = setTimeout(async () => {
      try { setRes(await searchApi.query(q.trim())); setActive(0); } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(id);
  }, [q, open]);

  // Flatten results for keyboard nav
  const flat: { label: string; sub: string; link: string }[] = [
    ...res.projects.map((p) => ({ label: p.name, sub: t('search.project'), link: p.link })),
    ...res.tasks.map((x) => ({ label: x.title, sub: x.isBoard ? t('search.boardTask') : t('search.task'), link: x.link })),
    ...res.events.map((e) => ({ label: e.title, sub: t('search.event'), link: e.link })),
  ];

  const go = useCallback((link: string) => {
    setOpen(false);
    navigate(link);
  }, [navigate]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active].link); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg bg-elevated border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          placeholder={t('search.placeholder')}
          className="w-full px-4 py-3.5 bg-transparent text-fg outline-none border-b border-border text-base"
        />
        <div className="max-h-80 overflow-y-auto">
          {q.trim().length < 2 ? (
            <p className="text-sm text-muted px-4 py-6 text-center">{t('search.hint')}</p>
          ) : flat.length === 0 ? (
            <p className="text-sm text-muted px-4 py-6 text-center">{t('search.empty')}</p>
          ) : (
            flat.map((item, i) => (
              <button
                key={`${item.link}-${i}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.link)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 ${
                  i === active ? 'bg-blue-500/15' : 'hover:bg-surface'
                }`}
              >
                <span className="text-sm text-fg truncate">{item.label}</span>
                <span className="text-[11px] text-muted flex-shrink-0">{item.sub}</span>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-border text-[11px] text-muted flex gap-3">
          <span>↑↓ {t('search.navigate')}</span>
          <span>⏎ {t('search.openItem')}</span>
          <span>Esc {t('search.close')}</span>
        </div>
      </div>
    </div>
  );
}
