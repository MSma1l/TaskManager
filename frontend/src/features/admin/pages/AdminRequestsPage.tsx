import { useEffect, useState } from 'react';
import { adminApi, AccessRequestRow } from '../api/admin';

const TABS: { value: 'PENDING' | 'APPROVED' | 'REJECTED'; label: string }[] = [
  { value: 'PENDING', label: 'In asteptare' },
  { value: 'APPROVED', label: 'Aprobate' },
  { value: 'REJECTED', label: 'Respinse' },
];

export default function AdminRequestsPage() {
  const [tab, setTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [items, setItems] = useState<AccessRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [approving, setApproving] = useState<AccessRequestRow | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Approve form fields
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER');
  const [pin, setPin] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await adminApi.listAccessRequests(tab);
      setItems(data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare incarcare cereri');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [tab]);

  const startApprove = (r: AccessRequestRow) => {
    setApproving(r);
    // Suggest a username from first.last names
    const suggested = `${r.firstName}.${r.lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
    setUsername(suggested);
    setRole('USER');
    setPin('');
  };

  const submitApprove = async () => {
    if (!approving) return;
    if (username.trim().length < 3) {
      setError('Username minim 3 caractere');
      return;
    }
    if (pin && (!/^\d+$/.test(pin) || pin.length < 4 || pin.length > 8)) {
      setError('PIN-ul trebuie sa fie 4–8 cifre');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.approveAccessRequest(approving.id, {
        username: username.trim().toLowerCase(),
        role,
        pin: pin || undefined,
      });
      setApproving(null);
      fetchData();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare la aprobare');
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejectingId) return;
    setBusy(true);
    try {
      await adminApi.rejectAccessRequest(rejectingId, rejectReason || undefined);
      setRejectingId(null);
      setRejectReason('');
      fetchData();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare la respingere');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Cereri de acces</h2>
          <p className="text-slate-400 text-sm">{items.length} cereri</p>
        </div>
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1 text-xs rounded-md ${
                tab === t.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading && <p className="text-slate-400 text-sm">Se incarca…</p>}
      {!loading && items.length === 0 && (
        <div className="text-center py-12 bg-slate-800/40 rounded-xl border border-slate-700/40">
          <p className="text-slate-400">Nicio cerere {tab === 'PENDING' ? 'in asteptare' : tab === 'APPROVED' ? 'aprobata' : 'respinsa'}</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="bg-slate-800 rounded-xl border border-slate-700/60 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold">{r.firstName} {r.lastName}</p>
                <p className="text-xs text-slate-400">
                  {r.email || '—'} · {r.phone || '—'} ·{' '}
                  <span className={r.purpose === 'collective' ? 'text-purple-400' : 'text-emerald-400'}>
                    {r.purpose === 'collective' ? 'Colectiv' : 'Personal'}
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Telegram: {r.telegramChatId || 'nelegat'} · {new Date(r.createdAt).toLocaleString('ro-RO')}
                </p>
              </div>
              <div className="flex gap-2">
                {r.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => startApprove(r)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg"
                    >
                      Aproba
                    </button>
                    <button
                      onClick={() => setRejectingId(r.id)}
                      className="bg-red-600/20 hover:bg-red-600/30 text-red-300 text-xs px-3 py-1.5 rounded-lg"
                    >
                      Respinge
                    </button>
                  </>
                )}
                {r.status === 'APPROVED' && <span className="text-xs text-emerald-400">✓ aprobat</span>}
                {r.status === 'REJECTED' && <span className="text-xs text-red-400">✕ respins</span>}
              </div>
            </div>
            {r.reason && (
              <p className="text-sm text-slate-300 bg-slate-900/40 rounded-lg px-3 py-2 mt-2">{r.reason}</p>
            )}
            {r.status === 'REJECTED' && r.rejectionReason && (
              <p className="text-xs text-red-300 mt-2">Motiv respingere: {r.rejectionReason}</p>
            )}
          </div>
        ))}
      </div>

      {/* Approve modal */}
      {approving && (
        <Modal title={`Aproba cererea pentru ${approving.firstName} ${approving.lastName}`} onClose={() => setApproving(null)}>
          <Field label="Username">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Rol">
            <select value={role} onChange={(e) => setRole(e.target.value as any)} className={inputCls}>
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </Field>
          <Field label="PIN initial (4–8 cifre, optional)">
            <input value={pin} onChange={(e) => setPin(e.target.value)} className={inputCls} />
          </Field>
          {approving.telegramChatId && (
            <p className="text-xs text-emerald-400">Telegram va fi legat automat la {approving.telegramChatId}</p>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setApproving(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2 text-sm">Anuleaza</button>
            <button onClick={submitApprove} disabled={busy} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2 text-sm disabled:opacity-60">
              {busy ? 'Se aproba...' : 'Aproba si creeaza cont'}
            </button>
          </div>
        </Modal>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <Modal title="Respinge cererea" onClose={() => { setRejectingId(null); setRejectReason(''); }}>
          <Field label="Motiv (optional, vizibil userului)">
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
          </Field>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2 text-sm">Anuleaza</button>
            <button onClick={submitReject} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg py-2 text-sm disabled:opacity-60">
              {busy ? 'Se respinge...' : 'Confirma respingere'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputCls =
  'w-full bg-slate-700 text-white border border-slate-600 focus:border-blue-500 focus:outline-none rounded-lg px-3 py-2 text-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">{title}</h3>
        {children}
      </div>
    </div>
  );
}
