import { useEffect, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { friendsApi, Friend, FriendRequest } from '../api/friends';

/** Sectiune de profil: gestionarea colaboratorilor (prieteni/colegi). */
export default function FriendsCard() {
  const t = useT();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const refresh = () => {
    friendsApi.list().then(setFriends).catch(() => {});
    friendsApi.incoming().then(setIncoming).catch(() => {});
    friendsApi.outgoing().then(setOutgoing).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  const add = async () => {
    const u = username.trim().toLowerCase();
    if (!u) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await friendsApi.add(u, 'colleague');
      setUsername('');
      setMsg(t('friends.requestSent'));
      refresh();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (id: string) => { await friendsApi.accept(id).catch(() => {}); refresh(); };
  const reject = async (id: string) => { await friendsApi.reject(id).catch(() => {}); refresh(); };
  const remove = async (uid: string) => { await friendsApi.remove(uid).catch(() => {}); refresh(); };

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <h2 className="font-semibold text-fg">{t('friends.title')}</h2>
      <p className="text-sm text-muted">{t('friends.hint')}</p>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {msg && <div className="text-sm text-emerald-500">{msg}</div>}

      <div className="flex gap-2">
        <input
          value={username}
          onChange={(e) => { setUsername(e.target.value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={t('friends.usernamePlaceholder')}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-input border border-border text-fg outline-none focus:border-blue-500"
        />
        <button onClick={add} disabled={busy || !username.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50">
          {t('friends.add')}
        </button>
      </div>

      {incoming.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1.5">{t('friends.incoming')}</p>
          <div className="flex flex-col gap-1.5">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg border border-border">
                <span className="flex-1 text-sm text-fg truncate">{r.fullName || r.username} <span className="text-muted">@{r.username}</span></span>
                <button onClick={() => accept(r.id)} className="text-xs text-emerald-500 font-semibold">{t('friends.accept')}</button>
                <button onClick={() => reject(r.id)} className="text-xs text-muted hover:text-red-400">{t('friends.reject')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wider text-muted mb-1.5">{t('friends.myCollaborators')}</p>
        {friends.length === 0 ? (
          <p className="text-sm text-muted">{t('friends.empty')}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {friends.map((f) => (
              <div key={f.userId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg border border-border">
                <span className="flex-1 text-sm text-fg truncate">{f.fullName || f.username} <span className="text-muted">@{f.username}</span></span>
                <button onClick={() => remove(f.userId)} title={t('friends.remove')} className="text-xs text-red-400/70 hover:text-red-400">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {outgoing.length > 0 && (
        <p className="text-xs text-muted">{t('friends.pending')}: {outgoing.map((o) => '@' + o.username).join(', ')}</p>
      )}
    </section>
  );
}
