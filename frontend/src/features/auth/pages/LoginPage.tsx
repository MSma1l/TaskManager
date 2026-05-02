import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, LoginChallenge } from '../api/auth';
import { useAuth } from '../hooks/useAuth';
import PinInput from '../components/PinInput';

type Mode = 'admin' | 'user';

interface LoginPageProps {
  mode?: Mode;
}

export default function LoginPage({ mode = 'user' }: LoginPageProps) {
  const navigate = useNavigate();
  const { isAuthenticated, role, verifyCode, refreshWithPin } = useAuth();

  const [step, setStep] = useState<'username' | 'code' | 'pin'>('username');
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const isAdmin = mode === 'admin';
  const target = isAdmin ? '/admin_task_manager/dashboard' : '/';

  useEffect(() => {
    if (isAuthenticated) {
      if (isAdmin && role !== 'ADMIN') {
        // wrong door — keep them on this admin page until they sign in as admin
        return;
      }
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, role, isAdmin, navigate, target]);

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

  const requestCode = async (uname: string) => {
    setBusy(true);
    setError(null);
    try {
      const challenge = isAdmin
        ? await authApi.requestAdminLoginCode(uname)
        : await authApi.requestLoginCode(uname);
      setChallenge(challenge);
      setStep('code');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Login esuat');
      setErrorKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    if (u.length < 3) {
      setError('Username minim 3 caractere');
      return;
    }
    localStorage.setItem('username', u);
    await requestCode(u);
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
      setError('Cod invalid sau expirat');
      setErrorKey((k) => k + 1);
    }
  };

  const handlePin = async (pin: string) => {
    setBusy(true);
    setError(null);
    const ok = await refreshWithPin(username, pin);
    setBusy(false);
    if (ok) {
      navigate(target, { replace: true });
    } else {
      setError('PIN gresit');
      setErrorKey((k) => k + 1);
    }
  };

  const titleColor = isAdmin ? 'bg-red-600' : 'bg-blue-600';
  const accentColor = isAdmin ? 'text-red-400' : 'text-blue-400';

  const hint = useMemo(() => {
    if (!challenge) return '';
    if (challenge.deliveredVia === 'console') {
      return 'Telegram nelegat — codul apare in log-urile serverului';
    }
    return challenge.hint || 'Verifica Telegram pentru cod';
  }, [challenge]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className={`w-20 h-20 rounded-2xl ${titleColor} flex items-center justify-center text-3xl font-bold mx-auto mb-4 text-white`}>
          {isAdmin ? 'A' : 'TM'}
        </div>
        <h1 className="text-2xl font-bold text-white">
          {isAdmin ? 'Admin Panel' : 'Weekly Task Manager'}
        </h1>
        <p className="text-slate-400 mt-2">
          {step === 'username' && (isAdmin ? 'Logare administrator' : 'Introdu username-ul')}
          {step === 'code' && 'Introdu codul din Telegram'}
          {step === 'pin' && 'Introdu PIN-ul de reinnoire'}
        </p>
      </div>

      {step === 'username' && (
        <form onSubmit={handleSubmitUsername} className="w-full max-w-xs">
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
            className={`w-full ${isAdmin ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'} text-white font-medium rounded-xl py-3 transition-colors disabled:opacity-60`}
          >
            {busy ? 'Se trimite cod...' : 'Trimite cod pe Telegram'}
          </button>
          {!isAdmin && (
            <button
              type="button"
              onClick={() => setStep('pin')}
              className="w-full text-slate-400 hover:text-slate-200 text-sm mt-3"
            >
              Am deja PIN — folosesc PIN
            </button>
          )}
        </form>
      )}

      {step === 'code' && challenge && (
        <div className="w-full max-w-md">
          <PinInput key={`code-${errorKey}`} length={6} masked={false} onComplete={handleCode} error={!!error} />
          <p className="text-center text-xs text-slate-500 mt-4">{hint}</p>
          <p className="text-center text-xs text-slate-500 mt-1">
            Cod valabil inca {secondsLeft}s
          </p>
          <div className="flex gap-2 justify-center mt-4">
            <button
              onClick={() => requestCode(username)}
              disabled={busy || secondsLeft > 240}
              className="text-sm text-slate-400 hover:text-white disabled:opacity-50"
            >
              Retrimite cod
            </button>
            <span className="text-slate-600">·</span>
            <button
              onClick={() => { setStep('username'); setChallenge(null); setError(null); }}
              className="text-sm text-slate-400 hover:text-white"
            >
              Schimba user
            </button>
          </div>
        </div>
      )}

      {step === 'pin' && (
        <div className="w-full max-w-md">
          <PinInput key={`pin-${errorKey}`} length={4} onComplete={handlePin} error={!!error} />
          <p className="text-center text-xs text-slate-500 mt-4">PIN-ul setat din profilul tau</p>
          <div className="flex gap-2 justify-center mt-4">
            <button
              onClick={() => setStep('username')}
              className="text-sm text-slate-400 hover:text-white"
            >
              Inapoi
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className={`${accentColor} text-sm mt-4`}>{error}</p>
      )}
    </div>
  );
}
