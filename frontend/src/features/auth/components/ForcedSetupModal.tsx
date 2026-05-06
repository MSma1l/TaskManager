import { useEffect, useRef, useState } from 'react';
import { authApi, MeResponse } from '../api/auth';
import { useT } from '../../../shared/i18n/I18nProvider';
import LanguageSwitcher from '../../../shared/i18n/LanguageSwitcher';

interface Props {
  me: MeResponse;
  onDone: (updated: MeResponse) => void;
}

type UsernameState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; reason?: string }
  | { status: 'taken'; reason: string }
  | { status: 'invalid'; reason: string };

/**
 * Forced setup shown immediately after login when the user is missing
 * essentials. Two steps:
 *   1) Identity — username (unique) + full name
 *   2) Security — PIN (4-8) + optional password (admin or user-side login)
 */
export default function ForcedSetupModal({ me, onDone }: Props) {
  const t = useT();
  const [username, setUsername] = useState(me.username);
  const [usernameState, setUsernameState] = useState<UsernameState>({ status: 'idle' });
  const [fullName, setFullName] = useState(me.fullName || '');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const isAdmin = me.role === 'ADMIN';
  const needPin = !me.hasPin;
  const checkTimer = useRef<number | null>(null);

  // Debounced availability check
  useEffect(() => {
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    const candidate = username.trim().toLowerCase();
    if (!candidate || candidate === me.username.toLowerCase()) {
      setUsernameState({ status: 'idle' });
      return;
    }
    if (!/^[a-z0-9_.]{3,30}$/.test(candidate)) {
      setUsernameState({ status: 'invalid', reason: '3-30 caractere: a-z, 0-9, _, .' });
      return;
    }
    setUsernameState({ status: 'checking' });
    checkTimer.current = window.setTimeout(async () => {
      try {
        const res = await authApi.checkUsername(candidate);
        setUsernameState(
          res.available
            ? { status: 'available', reason: res.reason }
            : { status: 'taken', reason: res.reason || 'Username deja folosit' },
        );
      } catch {
        setUsernameState({ status: 'idle' });
      }
    }, 350);
    return () => {
      if (checkTimer.current) window.clearTimeout(checkTimer.current);
    };
  }, [username, me.username]);

  useEffect(() => {
    setError(null);
  }, [step]);

  const submitStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setError('Numele complet este obligatoriu (min 2 caractere)');
      return;
    }
    const newUsername = username.trim().toLowerCase();
    const usernameChanged = newUsername !== me.username.toLowerCase();
    if (usernameChanged && usernameState.status !== 'available') {
      setError('Username invalid sau ocupat — alege altul');
      return;
    }
    setBusy(true);
    try {
      if (usernameChanged) {
        await authApi.updateUsername(newUsername);
        // Persist new username so re-login uses it
        localStorage.setItem('username', newUsername);
      }
      await authApi.updateMe({ fullName: trimmedName });
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Eroare salvare profil');
      setBusy(false);
      return;
    }
    setBusy(false);
    if (needPin) setStep(2); else finalize();
  };

  const submitStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN-ul trebuie sa aiba 4-8 cifre');
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

  // Username status badge for the field
  const usernameBadge = (() => {
    if (usernameState.status === 'idle') return null;
    if (usernameState.status === 'checking')
      return <span className="text-[11px] text-slate-400">Se verifica...</span>;
    if (usernameState.status === 'invalid')
      return <span className="text-[11px] text-amber-500">{usernameState.reason}</span>;
    if (usernameState.status === 'available')
      return <span className="text-[11px] text-emerald-500">Disponibil ✓</span>;
    return <span className="text-[11px] text-red-500">{usernameState.reason}</span>;
  })();

  const usernameBorderColor = (() => {
    if (usernameState.status === 'available') return 'border-emerald-500/60';
    if (usernameState.status === 'taken' || usernameState.status === 'invalid') return 'border-red-500/60';
    return 'border-border';
  })();

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-border shadow-2xl p-6 sm:p-8 relative">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <p className="text-xs uppercase tracking-wider text-blue-500 font-semibold">{t('setup.label')}</p>
          </div>
          <h2 className="text-2xl font-bold">{t('setup.title')}</h2>
          <p className="text-sm text-muted mt-1">
            {step === 1 ? t('setup.step1Sub') : t('setup.step2Sub')}
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted">{t('setup.username')}</label>
                {usernameBadge}
              </div>
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_.]/g, '').toLowerCase())}
                placeholder="username"
                autoComplete="username"
                className={`w-full bg-input text-fg rounded-lg px-3 py-2 border-2 outline-none transition-colors ${usernameBorderColor} focus:border-blue-500`}
              />
              <p className="text-[11px] text-muted mt-1">
                {t('setup.usernameRules')}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">{t('setup.fullName')}</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ion Popescu"
                className="w-full bg-input text-fg rounded-lg px-3 py-2 border border-border focus:border-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy || usernameState.status === 'checking'}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 mt-2"
            >
              {busy ? t('common.saving') : (needPin ? `${t('common.next')} →` : t('common.save'))}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submitStep2} className="space-y-3">
            <div>
              <label className="text-xs text-muted block mb-1">{t('setup.pin')}</label>
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
              <label className="text-xs text-muted block mb-1">{t('setup.pinConfirm')}</label>
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
                {t('setup.passwordOptional')}
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
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 bg-elevated hover:bg-fg/10 text-fg rounded-lg text-sm"
              >
                ← {t('common.back')}
              </button>
              <button
                type="submit"
                disabled={busy || pin.length < 4}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg py-2.5"
              >
                {busy ? t('common.saving') : t('common.finish')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
