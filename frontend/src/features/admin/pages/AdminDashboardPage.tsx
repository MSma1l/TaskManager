import { useEffect, useState } from 'react';
import { adminApi, AdminUser } from '../api/admin';

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch((e) => setError(e?.response?.data?.detail || 'Eroare'));
  }, []);

  const totalActive = users.filter((u) => u.isActive).length;
  const totalAdmins = users.filter((u) => u.role === 'ADMIN').length;
  const linked = users.filter((u) => !!u.telegramChatId).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-slate-400 text-sm">Vedere de ansamblu</p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-2">Tips</h3>
        <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
          <li>URL-ul de admin este <code className="bg-slate-900 px-1 rounded">/admin_task_manager</code> — pastreaza-l privat.</li>
          <li>Token-ul JWT expira la 12 ore — userul poate reinnoi cu PIN sau cu un cod nou trimis pe Telegram.</li>
          <li>Cand creezi un user nou, genereaza-i un cod /link sa-si lege chat-ul Telegram inainte de prima logare.</li>
        </ul>
      </div>
    </div>
  );
}
