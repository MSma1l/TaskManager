import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { adminApi, AdminUser } from '../api/admin';

type Priority = 'STANDARD' | 'URGENT';

export default function AdminNotifyPage() {
  const t = useT();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allUsers, setAllUsers] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('STANDARD');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);

  useEffect(() => {
    let cancelled = false;
    adminApi.listUsers()
      .then((rows) => { if (!cancelled) setUsers(rows); })
      .catch((e: any) => { if (!cancelled) setError(e?.response?.data?.detail || 'Eroare'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggleUser = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setAllUsers((v) => {
      const next = !v;
      if (next) setSelected(new Set());
      return next;
    });
  };

  const canSubmit = title.trim().length > 0 && (allUsers || selected.size > 0) && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const { sent } = await adminApi.sendNotification({
        userIds: allUsers ? [] : Array.from(selected),
        allUsers,
        title: title.trim(),
        body: body.trim() || undefined,
        priority,
      });
      setToast(t('adminNotify.sentToast').replace('{n}', String(sent)));
      setTitle('');
      setBody('');
      setPriority('STANDARD');
      setSelected(new Set());
      setAllUsers(false);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Nu s-a putut trimite notificarea');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold">{t('adminNotify.title')}</h2>
        <p className="text-slate-400 text-sm">{t('adminNotify.subtitle')}</p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {toast && (
        <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
          {toast}
        </p>
      )}

      <form onSubmit={submit} className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-4">
        {/* Recipients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('adminNotify.recipients')}</span>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={allUsers} onChange={toggleAll} className="accent-blue-500 w-4 h-4" />
              {t('adminNotify.selectAll')}
            </label>
          </div>
          <div className={`max-h-60 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-700/60 ${allUsers ? 'opacity-50 pointer-events-none' : ''}`}>
            {loading ? (
              <p className="text-slate-400 text-sm text-center py-4">{t('common.loading')}</p>
            ) : activeUsers.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">{t('adminNotify.noUsers')}</p>
            ) : (
              activeUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-900/50">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="accent-blue-500 w-4 h-4"
                  />
                  <span className="flex-1 truncate">{u.fullName || u.username}</span>
                  <span className="text-slate-500 font-mono text-xs">@{u.username}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Title */}
        <label className="block">
          <span className="text-xs text-slate-400 mb-1 block">{t('adminNotify.titleField')} *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} required maxLength={200} />
        </label>

        {/* Body */}
        <label className="block">
          <span className="text-xs text-slate-400 mb-1 block">{t('adminNotify.bodyField')}</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={inputCls} />
        </label>

        {/* Priority */}
        <div>
          <span className="text-xs text-slate-400 mb-1 block">{t('adminNotify.priority')}</span>
          <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setPriority('STANDARD')}
              className={`px-4 py-2 text-sm transition-colors ${priority === 'STANDARD' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'}`}
            >
              {t('adminNotify.priorityStandard')}
            </button>
            <button
              type="button"
              onClick={() => setPriority('URGENT')}
              className={`px-4 py-2 text-sm transition-colors ${priority === 'URGENT' ? 'bg-red-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'}`}
            >
              {t('adminNotify.priorityUrgent')}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? t('adminNotify.sending') : t('adminNotify.send')}
        </button>
      </form>
    </div>
  );
}

const inputCls =
  'w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded-lg px-3 py-2 text-sm';
