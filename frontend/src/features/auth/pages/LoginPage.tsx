import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, LoginChallenge, AuthSession } from '../api/auth';
import { useAuth } from '../hooks/useAuth';
import PinInput from '../components/PinInput';
import QRLoginCard from '../components/QRLoginCard';
import { useT } from '../../../shared/i18n/I18nProvider';
import LanguageSwitcher from '../../../shared/i18n/LanguageSwitcher';

type Mode = 'admin' | 'user';
type Step = 'main' | 'credentials' | 'code' | 'pin' | 'username-only';

interface LoginPageProps {
  mode?: Mode;
}

/**
 * User-facing login is Telegram-first. The default screen ('main') shows
 * two big primary CTAs — register/open via Telegram bot, or QR-scan login.
 * Existing users with a password / PIN / Telegram-code path can still get
 * to those flows via the small "deja ai cont?" links at the bottom.
 *
 * The /admin_task_manager door always starts at 'credentials' because
 * admins always have a password and there is no admin-side QR / Telegram
 * register flow.
 */
export default function LoginPage({ mode = 'user' }: LoginPageProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const t = useT();
  const { isAuthenticated, verifyCode, refreshWithPin, adminPasswordLogin, consumeSession } = useAuth();

  const isAdminMode = mode === 'admin';
  const [step, setStep] = useState<Step>(isAdminMode ? 'credentials' : 'main');
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [password, setPassword] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [tgRegisterLink, setTgRegisterLink] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  const isAdmin = isAdminMode;
  const returnTo = params.get('returnTo') || '';
  const target = isAdmin
    ? '/admin_task_manager/dashboard'
    : (returnTo && returnTo.startsWith('/') ? returnTo : '/');

  useEffect(() => {
    if (isAdmin) return;
    authApi.publicConfig()
      .then((c) => setTgRegisterLink(c.telegramRegisterDeepLink))
      .catch(() => { /* hide button if config unreachable */ });
  }, [isAdmin]);

  const handleQRLogin = (session: AuthSession) => {
    consumeSession(session);
    navigate(target, { replace: true });
  };

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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-6 relative">
      {/* Language switcher in the top-right corner */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="mb-7 text-center">
        <div className={`w-20 h-20 rounded-2xl ${titleColor} flex items-center justify-center text-3xl font-bold mx-auto mb-4 text-white shadow-lg`}>
          {isAdmin ? 'A' : 'TM'}
        </div>
        <h1 className="text-2xl font-bold text-white">
          {isAdmin ? t('login.adminTitle') : t('login.title')}
        </h1>
        <p className="text-slate-400 mt-2 text-sm">
          {step === 'main' && t('login.subMain')}
          {step === 'credentials' && (isAdmin ? t('login.subAdmin') : t('login.subCredentials'))}
          {step === 'username-only' && t('login.subUsernameOnly')}
          {step === 'code' && t('login.subCode')}
          {step === 'pin' && t('login.subPin')}
        </p>
      </div>

      {/* ── Main entry: Telegram-first hero ───────────────────────── */}
      {!isAdmin && step === 'main' && !showQR && (
        <div className="w-full max-w-xs">
          {/* Primary: Register/open via Telegram bot */}
          {tgRegisterLink ? (
            <a
              href={tgRegisterLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-gradient-to-br from-sky-500 to-blue-700 hover:from-sky-400 hover:to-blue-600 text-white rounded-2xl p-5 mb-3 transition-all shadow-xl shadow-blue-900/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-blue-100/80 font-semibold">{t('login.recommended')}</p>
                  <p className="font-bold text-base">{t('login.continueTelegram')}</p>
                </div>
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <p className="text-xs text-blue-100/90 leading-relaxed">
                {t('login.telegramHint')}
              </p>
            </a>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl p-3 mb-3 text-xs">
              Telegram nu este configurat — admin-ul trebuie sa seteze TELEGRAM_BOT_USERNAME.
            </div>
          )}

          {/* Secondary: QR scan */}
          <button
            type="button"
            onClick={() => { setShowQR(true); setError(null); }}
            className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-600/40 text-white rounded-xl p-4 mb-5 transition-all active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" strokeWidth="2" rx="1" />
                <rect x="14" y="3" width="7" height="7" strokeWidth="2" rx="1" />
                <rect x="3" y="14" width="7" height="7" strokeWidth="2" rx="1" />
                <path strokeLinecap="round" strokeWidth="2" d="M14 14h3M20 14v7M14 17v4M14 21h3M17 17h4" />
              </svg>
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-semibold text-sm">{t('login.scanQR')}</p>
              <p className="text-[11px] text-slate-400">{t('login.scanQRHint')}</p>
            </div>
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Existing users link cluster */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500">{t('login.haveAccount')}</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <div className="flex flex-col gap-1">
            <SmallLink onClick={() => { setStep('pin'); setError(null); }}>
              {t('login.pinReLogin')}
            </SmallLink>
            <SmallLink onClick={() => { setStep('credentials'); setError(null); }}>
              {t('login.classicLogin')}
            </SmallLink>
            <SmallLink onClick={() => { setStep('username-only'); setError(null); }}>
              {t('login.telegramCodeOnly')}
            </SmallLink>
          </div>
        </div>
      )}

      {/* QR scan-to-login */}
      {!isAdmin && showQR && (
        <div className="mb-5">
          <QRLoginCard onLogin={handleQRLogin} />
          <button
            type="button"
            onClick={() => setShowQR(false)}
            className="block mx-auto mt-3 text-sm text-slate-400 hover:text-slate-200"
          >
            ← Inapoi
          </button>
        </div>
      )}

      {/* ── Credentials (admin always, user on demand) ─────────────── */}
      {step === 'credentials' && !showQR && (
        <form onSubmit={handleCredentials} className="w-full max-w-xs space-y-3">
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('login.placeholderUsername')}
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none"
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('login.placeholderPassword')}
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className={`w-full ${primaryBtn} text-white font-medium rounded-xl py-3 transition-colors disabled:opacity-60`}
          >
            {busy ? t('common.loading') : t('login.btnContinue')}
          </button>
          <p className="text-[11px] text-center text-slate-500">
            {t('login.has2FAHint')}
          </p>

        </form>
      )}

      {/* "Inapoi" link below credentials — non-admin only (admin always
          stays on credentials, no place to go back to) */}
      {!isAdmin && step === 'credentials' && !showQR && (
        <button
          type="button"
          onClick={() => { setStep('main'); setError(null); setPassword(''); }}
          className="mt-3 text-sm text-slate-400 hover:text-slate-200"
        >
          {t('login.altLoginMethod')}
        </button>
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
            placeholder={t('login.placeholderUsername')}
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none mb-3"
          />
          <button
            type="submit"
            disabled={busy}
            className={`w-full ${primaryBtn} text-white font-medium rounded-xl py-3 transition-colors disabled:opacity-60`}
          >
            {busy ? t('common.loading') : t('login.btnSendCode')}
          </button>
          <button
            type="button"
            onClick={() => { setStep(isAdmin ? 'credentials' : 'main'); setError(null); }}
            className="w-full text-slate-400 hover:text-slate-200 text-sm mt-3"
          >
            ← {t('common.back')}
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
            placeholder={t('login.placeholderUsername')}
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none mb-3"
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder={t('login.placeholderPin')}
            className={`w-full bg-slate-800 border-2 ${error ? 'border-red-500 animate-shake' : 'border-slate-700'} focus:border-blue-500 text-white text-2xl tracking-widest rounded-xl px-4 py-3 outline-none mb-3 text-center font-mono`}
            key={`pin-${errorKey}`}
          />
          <button
            type="submit"
            disabled={busy || pinInput.length < 4}
            className={`w-full ${primaryBtn} disabled:opacity-60 text-white font-medium rounded-xl py-3 transition-colors`}
          >
            {busy ? t('common.loading') : t('login.btnLoginPin')}
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">{t('login.pinHint')}</p>
          <button
            type="button"
            onClick={() => { setStep(isAdmin ? 'credentials' : 'main'); setPinInput(''); setError(null); }}
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
          <p className="text-center text-xs text-slate-500 mt-1">{t('login.codeValid')} {secondsLeft}s</p>
          <div className="flex gap-2 justify-center mt-4">
            <button
              onClick={requestNewCode}
              disabled={busy || secondsLeft > 240}
              className="text-sm text-slate-400 hover:text-white disabled:opacity-50"
            >
              {t('login.resendCode')}
            </button>
            <span className="text-slate-600">·</span>
            <button
              onClick={() => { setStep(isAdmin ? 'credentials' : 'main'); setChallenge(null); setError(null); }}
              className="text-sm text-slate-400 hover:text-white"
            >
              {t('common.back')}
            </button>
          </div>
        </div>
      )}

      {error && <p className={`${accentColor} text-sm mt-4 text-center max-w-xs`}>{error}</p>}

      {!isAdmin && step === 'main' && !showQR && (
        <div className="mt-6 text-center">
          <Link to="/request-access" className="text-sm text-slate-500 hover:text-slate-300">
            {t('login.helpLink')}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Small text link for "deja ai cont?" cluster on the main login screen. */
function SmallLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-center py-2 text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-lg transition-colors"
    >
      {children}
    </button>
  );
}

