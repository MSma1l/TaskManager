import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { useAuth } from '../hooks/useAuth';

type Phase = 'idle' | 'confirming' | 'done' | 'error';

/**
 * Endpoint mobile lands on after scanning a desktop QR code. Requires the
 * user to already be logged in on this device — otherwise we send them to
 * the login page with a return-to URL.
 */
export default function QRConfirmPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, username } = useAuth();

  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If not logged in on this device, ask to log in first then return here
  useEffect(() => {
    if (!isAuthenticated) {
      const target = encodeURIComponent(`/qr-confirm/${id}`);
      navigate(`/login?returnTo=${target}`, { replace: true });
    }
  }, [isAuthenticated, id, navigate]);

  const confirm = async () => {
    if (!id) return;
    setPhase('confirming');
    setError(null);
    try {
      const res = await authApi.qrConfirm(id);
      setPhase('done');
      setMessage(`Sesiune aprobata pentru ${res.fullName || res.username}.`);
    } catch (e: any) {
      setPhase('error');
      setError(e?.response?.data?.detail || 'Confirmarea a esuat (poate a expirat?)');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <p className="text-slate-400">Te trimitem la logare...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs uppercase tracking-wider text-emerald-500 font-semibold">QR scan</p>
        </div>
        <h1 className="text-xl font-bold text-white mb-1">Confirmare logare desktop</h1>
        <p className="text-sm text-slate-400 mb-4">
          Vrei sa te loghezi pe browser-ul de unde ai scanat acest QR, ca <span className="text-blue-400">{username}</span>?
        </p>

        {error && (
          <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {phase === 'idle' && (
          <button
            onClick={confirm}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl py-3 transition-colors"
          >
            Confirm — logheaza desktop-ul
          </button>
        )}

        {phase === 'confirming' && (
          <div className="text-center text-slate-300 text-sm py-3">Se confirma...</div>
        )}

        {phase === 'done' && message && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg p-3 text-sm">
            {message}
            <p className="text-xs text-slate-400 mt-2">Poti inchide aceasta pagina.</p>
          </div>
        )}

        {phase === 'error' && (
          <button
            onClick={confirm}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 mt-2"
          >
            Reincearca
          </button>
        )}

        <Link to="/" className="block text-center text-slate-400 hover:text-slate-200 text-sm mt-4">
          ← Inapoi la aplicatie
        </Link>
      </div>
    </div>
  );
}
