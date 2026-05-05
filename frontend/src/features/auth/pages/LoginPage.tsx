import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, LoginChallenge } from '../api/auth';
import { useAuth } from '../hooks/useAuth';
import PinInput from '../components/PinInput';

type Mode = 'admin' | 'user';
type Step = 'credentials' | 'code' | 'pin' | 'username-only';

interface LoginPageProps {
  mode?: Mode;
}

/**
 * Unified login flow:
 *   1) credentials  — username + password (single field for password+2FA combo)
 *      • admin → straight to session
 *      • user with telegram → step 'code' for the 2FA code
 *      • user without telegram → straight to session
 *   2) code         — Telegram 2FA code (after credentials or "no password" path)
 *   3) pin          — quick re-login with PIN (4–8 digits)
 *   4) username-only — fallback for users without password (telegram code path)
 */
export default function LoginPage({ mode = 'user' }: LoginPageProps) {
  const navigate = useNavigate();
  const { isAuthenticated, verifyCode, refreshWithPin, adminPasswordLogin, consumeSession } = useAuth();

  const [step, setStep] = useState<Step>('credentials');
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [password, setPassword] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const isAdmin = mode === 'admin';
  const target = isAdmin ? '/admin_task_manager/dashboard' : '/';

  useEffect(() => {
    if (isAuthenticated) {
      // Admin door: ALWAYS require fresh username + password entry, even if a
      // session already exists. We invalidate the previous token so the form
      // is visible and accidental shared sessions cannot bypass admin login.
      if (isAdmin) return;
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, isAdmin, navigate, target]);

  // On entering /admin_task_manager, drop any existing session so the
  // form is always shown and the admin must re-authenticate.
  useEffect(() => {
    if (!isAdmin) return;
    if (localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('tokenExpiresAt');
      window.dispatchEvent(new Event('auth:expired'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown for code expiry
  useEffect(() => {
    if (!challenge) return;
    const tick = () => {
      const ms = new Date(challenge.expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [challenge]);

  const showError = (msg: string) => {
    setError(msg);
    setErrorKey((k) => k + 1);
  };

  // ── Combined credentials flow ───────────────────────────────────────────
  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    if (u.length < 3) return showError('Username minim 3 caractere');
    if (!password) return showError('Introdu parola');

    setBusy(true);
    localStorage.setItem('username', u);

    // Admin door: only allow ADMIN-mode endpoint (consistent with backend role check)
    if (isAdmin) {
      const ok = await adminPasswordLogin(u, password);
      setBusy(false);
      if (ok) {
        setPassword('');
        navigate(target, { replace: true });
      } else {
        showError('Username sau parola gresita');
      }
      return;
    }

    try {
      const res = await authApi.passwordLogin(u, password);
      setBusy(false);
      if (res.kind === 'session') {
        consumeSession({
          token: res.token,
          expiresAt: res.expiresAt,
          role: res.role,
          username: res.username,
          userId: res.userId,
        });
        setPassword('');
        navigate(target, { replace: true });
      } else {
        // Telegram 2FA needed
        setChallenge({
          challengeId: res.challengeId,
          expiresAt: res.expiresAt,
          deliveredVia: res.deliveredVia,
          hint: res.hint,
        });
        setPassword('');
        setStep('code');
      }
    } catch (err: any) {
      setBusy(false);
      showError(err?.response?.data?.detail || 'Username sau parola gresita');
    }
  };

  // ── Username-only path (legacy users without password) ──────────────────
  const handleUsernameOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    if (u.length < 3) return showError('Username minim 3 caractere');
    setBusy(true);
    localStorage.setItem('username', u);
    try {
      const ch = isAdmin
        ? await authApi.requestAdminLoginCode(u)
        : await authApi.requestLoginCode(u);
      setChallenge(ch);
      setStep('code');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Login esuat');
    } finally {
      setBusy(false);
    }
  };

  const handleCode = async (code: string) => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    const ok = await verifyCode(challenge.challengeId, code);
    setBusy(false);
    if (ok) {
      navigate(target, { replace: true });
    } else {
      showError('Cod invalid sau expirat');
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    if (u.length < 3) return showError('Introdu username-ul');
    const value = pinInput.trim();
    if (!/^\d{4,8}$/.test(value)) return showError('PIN trebuie sa aiba 4–8 cifre');
    setBusy(true);
    localStorage.setItem('username', u);
    const ok = await refreshWithPin(u, value);
    setBusy(false);
    if (ok) {
      setPinInput('');
      navigate(target, { replace: true });
    } else {
      showError('PIN sau username gresit');
    }
  };

  const requestNewCode = async () => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) return;
    setBusy(true);
    try {
      const ch = isAdmin
        ? await authApi.requestAdminLoginCode(u)
        : await authApi.requestLoginCode(u);
      setChallenge(ch);
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Eroare retrimitere cod');
    } finally {
      setBusy(false);
    }
  };

  const accentColor = isAdmin ? 'text-red-400' : 'text-blue-400';
  const titleColor = isAdmin ? 'bg-red-600' : 'bg-blue-600';
  const primaryBtn = isAdmin ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500';

  const hint = useMemo(() => {
    if (!challenge) return '';
    if (challenge.deliveredVia === 'console') {
      return 'Telegram nelegat — codul apare in log-urile serverului';
    }
    return challenge.hint || 'Verifica Telegram pentru cod';
  }, [challenge]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-6">
      <div className="mb-7 text-center">
        <div className={`w-20 h-20 rounded-2xl ${titleColor} flex items-center justify-center text-3xl font-bold mx-auto mb-4 text-white shadow-lg`}>
          {isAdmin ? 'A' : 'TM'}
        </div>
        <h1 className="text-2xl font-bold text-white">
          {isAdmin ? 'Admin Panel' : 'Weekly Task Manager'}
        </h1>
        <p className="text-slate-400 mt-2 text-sm">
          {step === 'credentials' && (isAdmin ? 'Logare administrator' : 'Username + parola')}
          {step === 'username-only' && 'Trimite cod pe Telegram'}
          {step === 'code' && 'Codul din Telegram'}
          {step === 'pin' && 'Re-logare rapida cu PIN'}
        </p>
      </div>

      {/* ── Credentials (default) ─────────────────────────────────── */}
      {step === 'credentials' && (
        <form onSubmit={handleCredentials} className="w-full max-w-xs space-y-3">
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none"
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="parola"
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className={`w-full ${primaryBtn} text-white font-medium rounded-xl py-3 transition-colors disabled:opacity-60`}
          >
            {busy ? 'Se verifica...' : 'Continua'}
          </button>
          <p className="text-[11px] text-center text-slate-500">
            Daca ai Telegram legat, vom cere si codul 2FA dupa parola.
          </p>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
            {!isAdmin && (
              <button
                type="button"
                onClick={() => { setStep('username-only'); setError(null); }}
                className="w-full text-slate-400 hover:text-slate-200 text-sm"
              >
                Nu ai parola? Loghează-te doar cu cod Telegram
              </button>
            )}
            <button
              type="button"
              onClick={() => { setStep('pin'); setError(null); }}
              className="w-full text-slate-400 hover:text-slate-200 text-sm"
            >
              Am deja PIN — re-logare rapida
            </button>
          </div>
        </form>
      )}

      {/* ── Username-only (Telegram code only) ───────────────────── */}
      {step === 'username-only' && (
        <form onSubmit={handleUsernameOnly} className="w-full max-w-xs">
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none mb-3"
          />
          <button
            type="submit"
            disabled={busy}
            className={`w-full ${primaryBtn} text-white font-medium rounded-xl py-3 transition-colors disabled:opacity-60`}
          >
            {busy ? 'Se trimite cod...' : 'Trimite cod pe Telegram'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('credentials'); setError(null); }}
            className="w-full text-slate-400 hover:text-slate-200 text-sm mt-3"
          >
            ← Logare cu username + parola
          </button>
        </form>
      )}

      {/* ── PIN re-login ──────────────────────────────────────────── */}
      {step === 'pin' && (
        <form onSubmit={handlePinSubmit} className="w-full max-w-xs">
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none mb-3"
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="PIN (4–8 cifre)"
            className={`w-full bg-slate-800 border-2 ${error ? 'border-red-500 animate-shake' : 'border-slate-700'} focus:border-blue-500 text-white text-2xl tracking-widest rounded-xl px-4 py-3 outline-none mb-3 text-center font-mono`}
            key={`pin-${errorKey}`}
          />
          <button
            type="submit"
            disabled={busy || pinInput.length < 4}
            className={`w-full ${primaryBtn} disabled:opacity-60 text-white font-medium rounded-xl py-3 transition-colors`}
          >
            {busy ? 'Se verifica...' : 'Logheaza cu PIN'}
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">PIN-ul setat din profilul tau</p>
          <button
            type="button"
            onClick={() => { setStep('credentials'); setPinInput(''); setError(null); }}
            className="w-full text-slate-400 hover:text-slate-200 text-sm mt-3"
          >
            ← Inapoi
          </button>
        </form>
      )}

      {/* ── Telegram code step ────────────────────────────────────── */}
      {step === 'code' && challenge && (
        <div className="w-full max-w-md">
          <PinInput key={`code-${errorKey}`} length={6} masked={false} onComplete={handleCode} error={!!error} />
          <p className="text-center text-xs text-slate-500 mt-4">{hint}</p>
          <p className="text-center text-xs text-slate-500 mt-1">Cod valabil inca {secondsLeft}s</p>
          <div className="flex gap-2 justify-center mt-4">
            <button
              onClick={requestNewCode}
              disabled={busy || secondsLeft > 240}
              className="text-sm text-slate-400 hover:text-white disabled:opacity-50"
            >
              Retrimite cod
            </button>
            <span className="text-slate-600">·</span>
            <button
              onClick={() => { setStep('credentials'); setChallenge(null); setError(null); }}
              className="text-sm text-slate-400 hover:text-white"
            >
              Inapoi
            </button>
          </div>
        </div>
      )}

      {error && <p className={`${accentColor} text-sm mt-4 text-center max-w-xs`}>{error}</p>}

      {!isAdmin && step === 'credentials' && (
        <div className="mt-8 text-center">
          <Link to="/request-access" className="text-sm text-slate-400 hover:text-slate-200">
            Nu ai cont? Cere acces →
          </Link>
        </div>
      )}
    </div>
  );
}
