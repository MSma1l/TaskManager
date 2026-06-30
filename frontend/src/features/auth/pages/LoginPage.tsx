import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, LoginChallenge, AuthSession } from '../api/auth';
import { useAuth } from '../hooks/useAuth';
import PinInput from '../components/PinInput';
import QRLoginCard from '../components/QRLoginCard';
import TelegramLoginCard from '../components/TelegramLoginCard';
import { useT } from '../../../shared/i18n/I18nProvider';
import LanguageSwitcher from '../../../shared/i18n/LanguageSwitcher';

type Mode = 'admin' | 'user';
type Step = 'main' | 'credentials' | 'code' | 'pin' | 'username-only' | 'signup';

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

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
  const [showTgLogin, setShowTgLogin] = useState(false);

  // ── Self-signup state ───────────────────────────────────────────────────
  const [suName, setSuName] = useState('');
  const [suUsername, setSuUsername] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');

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

  // ── Self-signup: live username availability ─────────────────────────────
  useEffect(() => {
    if (step !== 'signup') return;
    const u = suUsername.trim().toLowerCase();
    if (!u) { setUsernameStatus('idle'); return; }
    if (!USERNAME_RE.test(u)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    let cancelled = false;
    const id = setTimeout(() => {
      authApi.checkUsername(u)
        .then((r) => { if (!cancelled) setUsernameStatus(r.available ? 'available' : 'taken'); })
        .catch(() => { if (!cancelled) setUsernameStatus('idle'); });
    }, 400);
    return () => { cancelled = true; clearTimeout(id); };
  }, [suUsername, step]);

  // ── Self-signup submit (no admin approval — account is active immediately)
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = suUsername.trim().toLowerCase();
    const name = suName.trim();
    if (name.length < 1) return showError(t('login.errNameRequired'));
    if (!USERNAME_RE.test(u)) return showError(t('login.errUsernameInvalid'));
    if (usernameStatus === 'taken') return showError(t('login.errUsernameTaken'));
    if (suPassword.length < 6) return showError(t('login.errPasswordShort'));

    setBusy(true);
    try {
      const res = await authApi.signup({
        username: u,
        password: suPassword,
        fullName: name,
        email: suEmail.trim() || undefined,
      });
      // Same consume path as password-login's kind:'session' branch.
      consumeSession({
        token: res.token,
        expiresAt: res.expiresAt,
        role: res.role,
        username: res.username,
        userId: res.userId,
      });
      localStorage.setItem('username', u);
      setSuPassword('');
      navigate(target, { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail: string = err?.response?.data?.detail || '';
      if (status === 409) {
        showError(/mail/i.test(detail) ? t('login.errEmailTaken') : t('login.errUsernameTaken'));
      } else if (status === 400) {
        if (/pass/i.test(detail)) showError(t('login.errPasswordShort'));
        else if (/name/i.test(detail)) showError(t('login.errNameRequired'));
        else if (/user/i.test(detail)) showError(t('login.errUsernameInvalid'));
        else showError(detail || t('login.errSignup'));
      } else {
        showError(t('login.errSignup'));
      }
    } finally {
      setBusy(false);
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
    <div
      className="min-h-screen bg-slate-900 flex flex-col items-center px-4 relative"
      style={{
        // Honour iOS notch + home indicator and leave room for the absolute
        // language switcher above plus breathing space at the bottom.
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
        justifyContent: 'center',
      }}
    >
      {/* Language switcher in the top-right corner */}
      <div
        className="absolute right-4"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
      >
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
          {step === 'signup' && t('login.subSignup')}
          {step === 'credentials' && (isAdmin ? t('login.subAdmin') : t('login.subCredentials'))}
          {step === 'username-only' && t('login.subUsernameOnly')}
          {step === 'code' && t('login.subCode')}
          {step === 'pin' && t('login.subPin')}
        </p>
      </div>

      {/* ── Main entry: self-signup hero + existing-account methods ─── */}
      {!isAdmin && step === 'main' && !showQR && !showTgLogin && (
        <div className="w-full max-w-xs">
          {/* Primary: creeaza cont nou (fara aprobare) */}
          <button
            type="button"
            onClick={() => { setStep('signup'); setError(null); }}
            className="block w-full text-left bg-gradient-to-br from-sky-500 to-blue-700 hover:from-sky-400 hover:to-blue-600 text-white rounded-2xl p-5 mb-5 transition-all shadow-xl shadow-blue-900/30 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base">{t('login.createAccount')}</p>
                <p className="text-xs text-blue-100/90 leading-relaxed">{t('login.subSignup')}</p>
              </div>
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          {/* Existing users — quieter 2-card row */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500">{t('login.haveAccount')}</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MiniCard
              onClick={() => { setStep('credentials'); setError(null); }}
              accent="blue"
              label={t('login.classicLogin')}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
            />
            <MiniCard
              onClick={() => { setStep('pin'); setError(null); }}
              accent="amber"
              label={t('login.pinReLogin')}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth="2" />
                  <path strokeLinecap="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0v4" />
                </svg>
              }
            />
          </div>
        </div>
      )}

      {/* ── Self-signup form (no admin approval) ──────────────────── */}
      {!isAdmin && step === 'signup' && (
        <form onSubmit={handleSignup} className="w-full max-w-xs space-y-3">
          <input
            type="text"
            autoFocus
            autoComplete="name"
            value={suName}
            onChange={(e) => setSuName(e.target.value)}
            placeholder={t('login.signupNamePlaceholder')}
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none"
          />
          <div>
            <input
              type="text"
              autoComplete="username"
              value={suUsername}
              onChange={(e) => setSuUsername(e.target.value.toLowerCase())}
              placeholder={t('login.signupUsername')}
              className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none"
            />
            <p className="text-[11px] mt-1 px-1">
              {usernameStatus === 'checking' && <span className="text-slate-400">{t('setup.checking')}</span>}
              {usernameStatus === 'available' && <span className="text-emerald-400">{t('setup.available')}</span>}
              {usernameStatus === 'taken' && <span className="text-red-400">{t('login.errUsernameTaken')}</span>}
              {usernameStatus === 'invalid' && <span className="text-amber-400">{t('login.errUsernameInvalid')}</span>}
              {usernameStatus === 'idle' && <span className="text-slate-500">{t('setup.usernameRules')}</span>}
            </p>
          </div>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={suPassword}
              onChange={(e) => setSuPassword(e.target.value)}
              placeholder={t('login.signupPassword')}
              className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 pr-16 outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
            >
              {showPw ? t('login.hidePassword') : t('login.showPassword')}
            </button>
          </div>
          <input
            type="email"
            autoComplete="email"
            value={suEmail}
            onChange={(e) => setSuEmail(e.target.value)}
            placeholder={t('login.signupEmail')}
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 text-white text-lg rounded-xl px-4 py-3 outline-none"
          />
          <button
            type="submit"
            disabled={busy || usernameStatus === 'taken' || usernameStatus === 'invalid'}
            className={`w-full ${primaryBtn} text-white font-medium rounded-xl py-3 transition-colors disabled:opacity-60`}
          >
            {busy ? t('common.loading') : t('login.signupSubmit')}
          </button>
          <button
            type="button"
            onClick={() => { setStep('main'); setError(null); }}
            className="w-full text-slate-400 hover:text-slate-200 text-sm"
          >
            {t('login.signupBack')}
          </button>
        </form>
      )}

      {/* Login simplu din Telegram (cu aprobare admin) */}
      {!isAdmin && showTgLogin && (
        <div className="mb-5">
          <TelegramLoginCard onLogin={handleQRLogin} />
          <button
            type="button"
            onClick={() => setShowTgLogin(false)}
            className="block mx-auto mt-3 text-sm text-slate-400 hover:text-slate-200"
          >
            ← {t('common.back')}
          </button>
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

      {!isAdmin && (step === 'credentials' || step === 'pin') && !showQR && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setStep('signup'); setError(null); }}
            className="text-sm text-slate-500 hover:text-slate-300"
          >
            {t('login.noAccount')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact 3-up icon card used for the secondary "deja ai cont?" methods on
 * the main login screen. Color accent only on the icon — body stays quiet
 * so it doesn't compete with the primary Telegram CTA above.
 */
function MiniCard({
  onClick, icon, label, accent,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: 'amber' | 'blue' | 'sky';
}) {
  const accentMap = {
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'hover:border-amber-500/40' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'hover:border-blue-500/40' },
    sky: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'hover:border-sky-500/40' },
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 ${accentMap.border} transition-all duration-150 active:scale-[0.97] text-center`}
    >
      <span className={`w-8 h-8 rounded-lg ${accentMap.bg} ${accentMap.text} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </span>
      <span className="text-[10px] leading-tight text-slate-300 font-medium line-clamp-2">
        {label}
      </span>
    </button>
  );
}

