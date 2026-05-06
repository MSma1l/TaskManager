import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { authApi, AuthSession } from '../api/auth';

interface Props {
  onLogin: (session: AuthSession) => void;
}

type Phase = 'loading' | 'showing' | 'expired' | 'approved' | 'error';

/**
 * QR rendezvous between this desktop browser and the user's Telegram bot.
 *
 * The QR encodes a `t.me/<bot>?start=qr_<sessionId>` deep-link. When the
 * mobile scans the QR, Telegram opens the bot directly and our /start
 * handler approves the session. The desktop polls for status and consumes
 * the token when the bot signals approval — no need to bounce through the
 * browser.
 *
 * If the server has no TELEGRAM_BOT_USERNAME set, we fall back to a
 * web confirmation URL.
 */
export default function QRLoginCard({ onLogin }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [qrId, setQrId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [encodedUrl, setEncodedUrl] = useState<string>('');
  const [usesTelegram, setUsesTelegram] = useState(false);
  const pollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const expiresAtRef = useRef<number>(0);

  const startSession = async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await authApi.qrInit();
      setQrId(res.qrId);
      expiresAtRef.current = new Date(res.expiresAt).getTime();
      // Prefer the Telegram deep-link — it opens the bot immediately on
      // mobile, no browser detour. Fall back to the web URL.
      const url = res.telegramDeepLink || `${window.location.origin}/qr-confirm/${res.qrId}`;
      setUsesTelegram(!!res.telegramDeepLink);
      setEncodedUrl(url);
      const dataUrl = await QRCode.toDataURL(url, {
        width: 260,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
      setPhase('showing');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare generare QR');
      setPhase('error');
    }
  };

  useEffect(() => {
    startSession();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  // Countdown
  useEffect(() => {
    if (phase !== 'showing') return;
    const tick = () => {
      const sec = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
      setSecondsLeft(sec);
      if (sec <= 0) setPhase('expired');
    };
    tick();
    tickRef.current = window.setInterval(tick, 1000) as unknown as number;
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [phase]);

  // Polling for approval
  useEffect(() => {
    if (phase !== 'showing' || !qrId) return;
    const poll = async () => {
      try {
        const res = await authApi.qrStatus(qrId);
        if (res.status === 'APPROVED') {
          setPhase('approved');
          onLogin({
            token: res.token,
            expiresAt: res.expiresAt,
            role: res.role,
            username: res.username,
            userId: res.userId,
          });
        } else if (res.status === 'EXPIRED' || res.status === 'CONSUMED') {
          setPhase('expired');
        }
      } catch { /* keep polling */ }
    };
    pollRef.current = window.setInterval(poll, 2000) as unknown as number;
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [phase, qrId, onLogin]);

  const totalTtl = 300; // backend sets 5 min
  const progress = Math.max(0, Math.min(1, secondsLeft / totalTtl));

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 max-w-sm mx-auto shadow-xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <p className="text-xs uppercase tracking-wider text-emerald-500 font-semibold">
          QR login {usesTelegram && '· Telegram'}
        </p>
      </div>
      <h3 className="font-semibold text-white mb-1">Scaneaza cu telefonul</h3>
      <p className="text-xs text-slate-400 mb-4">
        {usesTelegram
          ? 'Scanezi → se deschide chatul botului pe telefon → aprobi automat.'
          : 'Foloseste aplicatia logata pe mobil ca sa aprobi sesiunea.'}
      </p>

      <div className="aspect-square w-full bg-white rounded-xl overflow-hidden flex items-center justify-center mb-3 relative shadow-inner">
        {phase === 'loading' && (
          <div className="text-slate-500 text-sm">Se genereaza...</div>
        )}
        {phase === 'showing' && qrDataUrl && (
          <img src={qrDataUrl} alt="QR login" className="w-full h-full p-2" />
        )}
        {phase === 'expired' && (
          <div className="text-center px-3">
            <p className="text-slate-700 text-sm font-medium mb-2">QR expirat</p>
            <button
              onClick={startSession}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg"
            >
              Genereaza altul
            </button>
          </div>
        )}
        {phase === 'approved' && (
          <div className="text-center px-3">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-emerald-700 text-sm font-semibold">Aprobat — se logheaza...</p>
          </div>
        )}
        {phase === 'error' && (
          <div className="text-center px-3">
            <p className="text-red-500 text-xs">{error}</p>
            <button onClick={startSession} className="mt-2 text-blue-600 text-xs underline">
              Reincearca
            </button>
          </div>
        )}
      </div>

      {phase === 'showing' && (
        <>
          {/* Progress bar */}
          <div className="w-full h-1 rounded-full bg-slate-700 overflow-hidden mb-2">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">Valabil {secondsLeft}s</span>
            <button
              onClick={startSession}
              className="text-blue-400 hover:text-blue-300"
              title="Genereaza alt QR"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Manual fallback link */}
          {usesTelegram && (
            <a
              href={encodedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-3 text-center text-[11px] text-slate-500 hover:text-slate-300 underline-offset-2 hover:underline"
            >
              sau apasa aici pe telefon →
            </a>
          )}
        </>
      )}
    </div>
  );
}
