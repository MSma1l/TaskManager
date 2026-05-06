import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { authApi, AuthSession } from '../api/auth';

interface Props {
  onLogin: (session: AuthSession) => void;
}

type Phase = 'loading' | 'showing' | 'expired' | 'approved' | 'error';

/**
 * Renders a scannable QR code that, when scanned by a logged-in mobile,
 * approves a fresh session for THIS desktop browser. Polls the backend
 * every 2s. Auto-refreshes on expiry.
 */
export default function QRLoginCard({ onLogin }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [qrId, setQrId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
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
      // Encode the URL the mobile will open when scanning
      const confirmUrl = `${window.location.origin}/qr-confirm/${res.qrId}`;
      const dataUrl = await QRCode.toDataURL(confirmUrl, {
        width: 240,
        margin: 1,
        color: { dark: '#0f172a', light: '#f8fafc' },
      });
      setQrDataUrl(dataUrl);
      setPhase('showing');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare generare QR');
      setPhase('error');
    }
  };

  // First mount → start a session
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
      } catch {
        // soft-fail: keep polling
      }
    };
    pollRef.current = window.setInterval(poll, 2000) as unknown as number;
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [phase, qrId, onLogin]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 max-w-xs mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <p className="text-xs uppercase tracking-wider text-emerald-500 font-semibold">QR login</p>
      </div>
      <h3 className="font-semibold text-white mb-1">Scaneaza cu telefonul</h3>
      <p className="text-xs text-slate-400 mb-3">
        Foloseste aplicatia logata pe mobil ca sa aprobi sesiunea de pe acest browser.
      </p>

      <div className="aspect-square w-full bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center mb-3 relative">
        {phase === 'loading' && (
          <div className="text-slate-400 text-sm">Se genereaza...</div>
        )}
        {phase === 'showing' && qrDataUrl && (
          <img src={qrDataUrl} alt="QR login" className="w-full h-full" />
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
            <p className="text-emerald-600 text-sm font-semibold">Aprobat — se logheaza...</p>
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
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Valabil inca {secondsLeft}s</span>
          <button
            onClick={startSession}
            className="text-blue-400 hover:text-blue-300"
            title="Genereaza alt QR"
          >
            ↻ Refresh
          </button>
        </div>
      )}
    </div>
  );
}
