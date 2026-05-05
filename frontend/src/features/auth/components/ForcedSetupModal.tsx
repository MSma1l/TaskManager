import { useEffect, useState } from 'react';
import { authApi, MeResponse } from '../api/auth';

interface Props {
  me: MeResponse;
  onDone: (updated: MeResponse) => void;
}

/**
 * Forced setup shown immediately after login when the user is missing
 * essentials: full name and PIN. Admins also see an optional password field.
 *
 * - PIN: required (4–8 digits) — used for fast re-login after token expiry
 * - Full name: required — used in UI / notifications
 * - Admin password: optional — used by admin password login flow
 */
export default function ForcedSetupModal({ me, onDone }: Props) {
  const [fullName, setFullName] = useState(me.fullName || '');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const needName = !me.fullName;
  const needPin = !me.hasPin;
  const isAdmin = me.role === 'ADMIN';

  useEffect(() => {
    setError(null);
  }, [step]);

  const submitStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needName) {
      const trimmed = fullName.trim();
      if (trimmed.length < 2) {
        setError('Numele complet este obligatoriu (min 2 caractere)');
        return;
      }
      setBusy(true);
      try {
        await authApi.updateMe({ fullName: trimmed });
      } catch (err: any) {
        setError(err?.response?.data?.detail || 'Eroare salvare nume');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (needPin) {
      setStep(2);
    } else {
      finalize();
    }
  };

  const submitStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN-ul trebuie sa aiba 4–8 cifre');
      return;
    }
    if (pin !== pin2) {
      setError('PIN-urile nu coincid');
      return;
    }
    setBusy(true);
    try {
      await authApi.setPin(pin);
      if (accountPassword && accountPassword.length >= 6) {
        try {
          if (isAdmin) await authApi.setAdminPassword(accountPassword);
          else await authApi.setUserPassword(accountPassword);
        } catch { /* tolerate */ }
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Eroare salvare PIN');
      setBusy(false);
      return;
    }
    setBusy(false);
    finalize();
  };

  const finalize = async () => {
    try {
      const updated = await authApi.me();
      onDone(updated);
    } catch {
      onDone(me);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-border shadow-2xl p-6 sm:p-8">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <p className="text-xs uppercase tracking-wider text-blue-500 font-semibold">Setup obligatoriu</p>
          </div>
          <h2 className="text-2xl font-bold">Configureaza-ti contul</h2>
          <p className="text-sm text-muted mt-1">
            {step === 1
              ? 'Datele de baza ale contului — nume si modul de re-logare.'
              : 'Setezi un PIN scurt (4–8 cifre) pentru re-logare rapida.'}
          </p>
          <div className="flex gap-1.5 mt-3">
            <span className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-elevated'}`} />
            <span className={`h-1.5 flex-1 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-elevated'}`} />
          </div>
        </div>

        {error && (
          <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={submitStep1} className="space-y-3">
            <div>
              <label className="text-xs text-muted block mb-1">Username</label>
              <input
                type="text"
                value={me.username}
                disabled
                className="w-full bg-input/60 text-fg/70 rounded-lg px-3 py-2 border border-border"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Nume complet *</label>
              <input
                type="text"
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ion Popescu"
                className="w-full bg-input text-fg rounded-lg px-3 py-2 border border-border focus:border-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 mt-2"
            >
              {busy ? 'Se salveaza...' : (needPin ? 'Continua →' : 'Salveaza si intra')}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submitStep2} className="space-y-3">
            <div>
              <label className="text-xs text-muted block mb-1">PIN nou (4–8 cifre) *</label>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="••••"
                className="w-full bg-input text-fg rounded-lg px-3 py-2 border border-border focus:border-blue-500 outline-none text-center text-xl tracking-widest font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Confirma PIN *</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="••••"
                className="w-full bg-input text-fg rounded-lg px-3 py-2 border border-border focus:border-blue-500 outline-none text-center text-xl tracking-widest font-mono"
              />
            </div>

            <div className="pt-2 border-t border-border">
              <label className="text-xs text-muted block mb-1">
                Parola {isAdmin ? 'admin' : 'cont'} (optional, min 6 caractere)
              </label>
              <input
                type="password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                placeholder="parola pentru logare directa"
                className="w-full bg-input text-fg rounded-lg px-3 py-2 border border-border focus:border-blue-500 outline-none"
              />
              <p className="text-[11px] text-muted mt-1">
                {isAdmin
                  ? 'Cu parola, intri direct pe /admin_task_manager fara cod Telegram.'
                  : 'Cu parola, intri cu username + parola (+ cod Telegram daca e legat).'}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              {needName && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 bg-elevated hover:bg-fg/10 text-fg rounded-lg text-sm"
                >
                  ← Inapoi
                </button>
              )}
              <button
                type="submit"
                disabled={busy || pin.length < 4}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg py-2.5"
              >
                {busy ? 'Se salveaza...' : 'Finalizeaza setup'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
