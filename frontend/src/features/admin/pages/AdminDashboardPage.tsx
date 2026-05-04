import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, AdminUser, AccessRequestRow } from '../api/admin';

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pending, setPending] = useState<AccessRequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [u, p] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listAccessRequests('PENDING'),
      ]);
      setUsers(u);
      setPending(p);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare la incarcare');
    }
  };

  useEffect(() => { refresh(); }, []);

  const totalActive = users.filter((u) => u.isActive).length;
  const totalAdmins = users.filter((u) => u.role === 'ADMIN').length;
  const linked = users.filter((u) => !!u.telegramChatId).length;

  const quickApprove = async (r: AccessRequestRow) => {
    const suggested = `${r.firstName}.${r.lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
    const username = prompt(`Username pentru ${r.firstName} ${r.lastName}:`, suggested);
    if (!username) return;
    setBusyId(r.id);
    try {
      await adminApi.approveAccessRequest(r.id, { username: username.trim().toLowerCase(), role: 'USER' });
      await refresh();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Eroare aprobare');
    } finally {
      setBusyId(null);
    }
  };

  const quickReject = async (r: AccessRequestRow) => {
    const reason = prompt('Motiv respingere (optional):', '');
    if (reason === null) return;
    setBusyId(r.id);
    try {
      await adminApi.rejectAccessRequest(r.id, reason || undefined);
      await refresh();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Eroare respingere');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-slate-400 text-sm">Vedere de ansamblu</p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-slate-400 text-xs uppercase tracking-wide">Utilizatori activi</p>
          <p className="text-3xl font-bold mt-1">{totalActive}</p>
          <p className="text-slate-500 text-xs mt-1">Total {users.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-slate-400 text-xs uppercase tracking-wide">Administratori</p>
          <p className="text-3xl font-bold mt-1">{totalAdmins}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-slate-400 text-xs uppercase tracking-wide">Telegram legat</p>
          <p className="text-3xl font-bold mt-1">{linked}/{users.length}</p>
        </div>
        <div className={`rounded-xl p-4 border ${pending.length ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-800 border-slate-700'}`}>
          <p className="text-slate-400 text-xs uppercase tracking-wide">Cereri in asteptare</p>
          <p className={`text-3xl font-bold mt-1 ${pending.length ? 'text-amber-400' : ''}`}>{pending.length}</p>
          {pending.length > 0 && (
            <button onClick={() => navigate('/admin_task_manager/requests')} className="text-xs text-amber-300 hover:underline mt-1">
              Vezi toate →
            </button>
          )}
        </div>
      </div>

      {/* Pending access requests — quick actions */}
      {pending.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-amber-500/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div>
              <h3 className="font-semibold">Cereri noi de acces</h3>
              <p className="text-xs text-slate-400">Aproba ca userii sa colaboreze in proiect</p>
            </div>
            <button
              onClick={() => navigate('/admin_task_manager/requests')}
              className="text-sm text-blue-400 hover:underline"
            >
              Toate cererile →
            </button>
          </div>
          <ul className="divide-y divide-slate-700/60">
            {pending.slice(0, 5).map((r) => (
              <li key={r.id} className="p-4 flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 ${r.purpose === 'collective' ? 'bg-purple-400' : 'bg-emerald-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{r.firstName} {r.lastName}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {r.email || '—'} · {r.phone || '—'} · {r.purpose === 'collective' ? 'Colectiv' : 'Personal'}
                    {r.telegramChatId && <span className="text-emerald-400"> · TG legat</span>}
                  </p>
                  {r.reason && <p className="text-sm text-slate-300 mt-1 line-clamp-2">{r.reason}</p>}
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(r.createdAt).toLocaleString('ro-RO')}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    disabled={busyId === r.id}
                    onClick={() => quickApprove(r)}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                  >
                    Aproba
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => quickReject(r)}
                    className="bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 text-red-300 text-xs px-3 py-1.5 rounded-lg"
                  >
                    Respinge
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {pending.length > 5 && (
            <div className="px-4 py-2 text-xs text-slate-400 bg-slate-900/40 text-center">
              … si inca {pending.length - 5} cereri
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-2">Cum colaboreaza userii noi</h3>
        <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1.5">
          <li>Userul intra pe botul de Telegram, scrie <code className="bg-slate-900 px-1 rounded">/start</code> → bot-ul ii da link spre <code className="bg-slate-900 px-1 rounded">/request-access</code> cu chat-ul deja completat.</li>
          <li>Userul completeaza formularul (nume, email, telefon, scop, motiv) si trimite cererea.</li>
          <li>Cererea apare aici pe Dashboard si in tab-ul <strong>Cereri</strong>; tu o aprobi cu un click.</li>
          <li>Userul primeste mesaj de bun-venit pe Telegram cu username-ul si PIN-ul (daca l-ai pus). Poate intra imediat.</li>
        </ol>
      </div>
    </div>
  );
}
