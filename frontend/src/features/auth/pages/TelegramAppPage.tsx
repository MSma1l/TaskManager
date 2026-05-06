import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { useAuth } from '../hooks/useAuth';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: any;
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        themeParams?: any;
        colorScheme?: 'light' | 'dark';
      };
    };
  }
}

type Phase = 'detecting' | 'no-tg' | 'authenticating' | 'pin' | 'done' | 'error';

const PIN_TTL_SECONDS = 60;

/**
 * Entry point for the Telegram Mini App.
 *  1. Reads Telegram.WebApp.initData (signed by the bot token)
 *  2. POSTs it to the backend, which verifies HMAC and issues a session
 *  3. Shows a quick PIN re-entry gate for extra confidence; the PIN is
 *     verified against the same /auth/refresh endpoint as the regular site
 *  4. Redirects into the regular app once the PIN is approved
 *
 * The PIN gate has a visible countdown so the user knows how long the
 * sesiunea is valid before re-asking.
 */
export default function TelegramAppPage() {
  const navigate = useNavigate();
  const { consumeSession, refreshWithPin, username } = useAuth();

  const [phase, setPhase] = useState<Phase>('detecting');
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinShake, setPinShake] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PIN_TTL_SECONDS);
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);

  const tg = useMemo(() => window.Telegram?.WebApp, []);

  // Step 1: Auth via initData
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { tg?.ready?.(); tg?.expand?.(); } catch { /* ignore */ }

      const initData = tg?.initData || '';
      if (!initData) {
        setPhase('no-tg');
        return;
      }
      setPhase('authenticating');
      try {
        const session = await authApi.telegramWebappAuth(initData);
        if (cancelled) return;
        consumeSession(session);
        setResolvedUsername(session.username || null);
        setPhase('pin');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.response?.data?.detail || 'Autentificare Telegram esuata');
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 2: countdown for PIN gate
  useEffect(() => {
    if (phase !== 'pin') return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, PIN_TTL_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left === 0) {
        setError('Timpul a expirat — reincarca aplicatia');
        setPhase('error');
      }
    };
    tick();
    tickRef.current = window.setInterval(tick, 1000) as unknown as number;
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [phase]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN trebuie sa aiba 4-8 cifre');
      setPinShake((k) => k + 1);
      return;
    }
    const u = resolvedUsername || username || '';
    if (!u) {
      setError('Username inexistent in sesiune');
      return;
    }
    const ok = await refreshWithPin(u, pin);
    if (ok) {
      setPhase('done');
      setTimeout(() => navigate('/', { replace: true }), 400);
    } else {
      setError('PIN gresit');
      setPinShake((k) => k + 1);
      setPin('');
    }
  };

  const colorScheme = tg?.colorScheme === 'light' ? 'light' : 'dark';
  const accent = '#3b82f6';
  const bg = colorScheme === 'light' ? '#f8fafc' : '#0f172a';
  const fg = colorScheme === 'light' ? '#0f172a' : '#f8fafc';
  const surface = colorScheme === 'light' ? '#ffffff' : '#1e293b';
  const border = colorScheme === 'light' ? '#cbd5e1' : '#334155';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-6" style={{ backgroundColor: bg, color: fg }}>
      <div className="w-full max-w-sm rounded-2xl p-6 border shadow-2xl" style={{ backgroundColor: surface, borderColor: border }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
          <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: accent }}>
            Telegram Mini App
          </p>
        </div>

        {phase === 'detecting' && <p className="text-sm opacity-70">Se detecteaza Telegram...</p>}

        {phase === 'no-tg' && (
          <>
            <h1 className="text-xl font-bold mb-2">Deschide din Telegram</h1>
            <p className="text-sm opacity-70 mb-3">
              Aceasta pagina functioneaza doar deschisa ca Mini App in chatul botului.
              Apasa butonul "Deschide app" din meniul botului.
            </p>
            <Link to="/login" className="inline-block text-sm" style={{ color: accent }}>
              ← La logarea normala
            </Link>
          </>
        )}

        {phase === 'authenticating' && (
          <>
            <h1 className="text-xl font-bold mb-1">Autentificare...</h1>
            <p className="text-sm opacity-70">Se verifica semnatura Telegram.</p>
          </>
        )}

        {phase === 'pin' && (
          <form onSubmit={handlePinSubmit}>
            <h1 className="text-xl font-bold mb-1">
              Bun venit{resolvedUsername ? `, @${resolvedUsername}` : ''}!
            </h1>
            <p className="text-sm opacity-70 mb-3">Confirma cu PIN-ul de cont (4-8 cifre)</p>

            {/* Countdown bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1 opacity-70">
                <span>Cod valabil</span>
                <span className="font-mono">{secondsLeft}s</span>
              </div>
              <div className="w-full rounded-full overflow-hidden h-1.5" style={{ backgroundColor: border }}>
                <div
                  className="h-full transition-all"
                  style={{
                    backgroundColor: accent,
                    width: `${(secondsLeft / PIN_TTL_SECONDS) * 100}%`,
                  }}
                />
              </div>
            </div>

            <input
              key={`pin-${pinShake}`}
              type="password"
              inputMode="numeric"
              autoFocus
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="••••"
              className={`w-full text-2xl text-center tracking-widest font-mono rounded-lg px-3 py-3 outline-none border-2 ${pinShake ? 'animate-shake' : ''}`}
              style={{
                backgroundColor: bg,
                color: fg,
                borderColor: error ? '#ef4444' : border,
              }}
            />
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

            <button
              type="submit"
              disabled={pin.length < 4}
              className="w-full mt-3 py-3 rounded-xl text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              Intra
            </button>
          </form>
        )}

        {phase === 'done' && (
          <>
            <h1 className="text-xl font-bold mb-1" style={{ color: '#10b981' }}>Logat ✓</h1>
            <p className="text-sm opacity-70">Te trimitem in aplicatie...</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: '#ef4444' }}>Eroare</h1>
            <p className="text-sm opacity-70 mb-3">{error}</p>
            <Link to="/login" className="text-sm" style={{ color: accent }}>
              ← La logarea normala
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
