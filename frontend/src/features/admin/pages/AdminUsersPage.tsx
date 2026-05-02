import { useEffect, useState } from 'react';
import { adminApi, AdminUser, CreateUserPayload, LinkCodeResponse } from '../api/admin';

const emptyForm: CreateUserPayload = {
  username: '',
  email: '',
  fullName: '',
  telegramChatId: '',
  role: 'USER',
  pin: '',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateUserPayload>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [linkInfo, setLinkInfo] = useState<{ user: AdminUser; data: LinkCodeResponse } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      setUsers(await adminApi.listUsers());
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.createUser({
        ...form,
        username: form.username.trim().toLowerCase(),
        email: form.email?.trim() || undefined,
        fullName: form.fullName?.trim() || undefined,
        telegramChatId: form.telegramChatId?.trim() || undefined,
        pin: form.pin?.trim() || undefined,
      });
      setForm(emptyForm);
      setShowForm(false);
      await fetchUsers();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Nu s-a putut crea userul');
    } finally {
      setBusy(false);
    }
  };

  const toggleRole = async (u: AdminUser) => {
    await adminApi.updateUser(u.id, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' });
    fetchUsers();
  };

  const toggleActive = async (u: AdminUser) => {
    await adminApi.updateUser(u.id, { isActive: !u.isActive });
    fetchUsers();
  };

  const generateLink = async (u: AdminUser) => {
    try {
      const data = await adminApi.generateLinkCode(u.id);
      setLinkInfo({ user: u, data });
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare la generare cod');
    }
  };

  const removeUser = async (u: AdminUser) => {
    if (!confirm(`Dezactivezi userul "${u.username}"?`)) return;
    await adminApi.deleteUser(u.id);
    fetchUsers();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Utilizatori</h2>
          <p className="text-slate-400 text-sm">{users.length} total</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm"
        >
          {showForm ? 'Inchide' : '+ User nou'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {showForm && (
        <form onSubmit={submit} className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Username *">
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="Nume complet">
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Telegram Chat ID">
              <input value={form.telegramChatId} onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })} placeholder="(optional)" className={inputCls} />
            </Field>
            <Field label="Rol">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'USER' | 'ADMIN' })} className={inputCls}>
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </Field>
            <Field label="PIN initial (4–8 cifre)">
              <input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <button disabled={busy} type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm disabled:opacity-60">
            {busy ? 'Se creeaza...' : 'Creeaza user'}
          </button>
        </form>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left">
            <tr>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Nume</th>
              <th className="px-3 py-2">Telegram</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Activ</th>
              <th className="px-3 py-2">PIN</th>
              <th className="px-3 py-2 text-right">Actiuni</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-4 text-slate-400 text-center">Se incarca…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-slate-400 text-center">Niciun user</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-700/60">
                <td className="px-3 py-2 font-mono">{u.username}</td>
                <td className="px-3 py-2">{u.fullName || '—'}</td>
                <td className="px-3 py-2">
                  {u.telegramChatId ? (
                    <span className="text-emerald-400">legat ({u.telegramChatId})</span>
                  ) : (
                    <button onClick={() => generateLink(u)} className="text-blue-400 hover:underline">genereaza /link</button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => toggleRole(u)} className={`px-2 py-0.5 rounded text-xs ${u.role === 'ADMIN' ? 'bg-red-600/30 text-red-300' : 'bg-slate-700 text-slate-200'}`}>
                    {u.role}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => toggleActive(u)} className={`px-2 py-0.5 rounded text-xs ${u.isActive ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                    {u.isActive ? 'da' : 'nu'}
                  </button>
                </td>
                <td className="px-3 py-2">{u.hasPin ? 'da' : '—'}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => generateLink(u)} className="text-xs text-slate-300 hover:text-white">Cod /link</button>
                  <button onClick={() => removeUser(u)} className="text-xs text-red-400 hover:text-red-300">Dezactiveaza</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {linkInfo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setLinkInfo(null)}>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Cod /link pentru {linkInfo.user.username}</h3>
            <p className="text-xs text-slate-400 mb-3">{linkInfo.data.instructions}</p>
            <div className="bg-slate-900 rounded-lg p-3 text-center text-3xl font-mono tracking-widest mb-3">
              {linkInfo.data.code}
            </div>
            <p className="text-xs text-slate-500">Expira: {new Date(linkInfo.data.expiresAt).toLocaleString()}</p>
            <button onClick={() => setLinkInfo(null)} className="mt-4 w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-2 text-sm">Inchide</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded-lg px-3 py-2 text-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
