import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { authApi, AuthSession } from '../api/auth';
import { useT } from '../../../shared/i18n/I18nProvider';

interface Props {
  onLogin: (session: AuthSession) => void;
}

type Phase =
  | 'loading'
  | 'waiting'        // sesiune creată, aștept să deschidă botul (PENDING)
  | 'awaiting_admin' // botul a primit datele, aștept aprobarea adminului
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'error';

/**
 * Login simplu din Telegram cu aprobare admin.
 *
 * Web pornește o sesiune (`tg-login/init`) și afișează un deep-link/QR către
 * bot. Pe mobil userul apasă „Deschide Telegram"; pe desktop scanează QR-ul.
 * Botul îl logează instant dacă chat-ul e legat, altfel îi cere numele și
 * trimite adminului o întrebare cu butoane. Cât timp web-ul face polling,
 * trecem prin AWAITING_ADMIN → APPROVED (primim token) / REJECTED.
 */
export default function TelegramLoginCard({ onLogin }: Props) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('loading');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const start = async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await authApi.tgLoginInit();
      sessionRef.current = res.sessionId;
      setDeepLink(res.deepLink);
      if (res.deepLink) {
        const dataUrl = await QRCode.toDataURL(res.deepLink, {
          width: 220,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        setQrDataUrl(dataUrl);
      }
      setPhase('waiting');
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('common.error'));
      setPhase('error');
    }
  };

  useEffect(() => {
    start();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling
  useEffect(() => {
    if ((phase !== 'waiting' && phase !== 'awaiting_admin') || !sessionRef.current) return;
    const poll = async () => {
      try {
        const res = await authApi.tgLoginStatus(sessionRef.current as string);
        if (res.status === 'APPROVED') {
          setPhase('approved');
          onLogin({
            token: res.token,
            expiresAt: res.expiresAt,
            role: res.role,
            username: res.username,
            userId: res.userId,
          });
        } else if (res.status === 'AWAITING_ADMIN') {
          setPhase('awaiting_admin');
        } else if (res.status === 'REJECTED') {
          setPhase('rejected');
        } else if (res.status === 'EXPIRED' || res.status === 'CONSUMED') {
          setPhase('expired');
        }
      } catch { /* keep polling */ }
    };
    pollRef.current = window.setInterval(poll, 2000) as unknown as number;
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [phase, onLogin]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 max-w-sm mx-auto shadow-xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
        <p className="text-xs uppercase tracking-wider text-sky-400 font-semibold">
          {t('login.tgLoginTitle')}
        </p>
      </div>

      {(phase === 'loading' || phase === 'error') && (
        <div className="py-8 text-center">
          {phase === 'loading' ? (
            <p className="text-slate-400 text-sm">{t('common.loading')}</p>
          ) : (
            <>
              <p className="text-red-400 text-sm mb-2">{error}</p>
              <button onClick={start} className="text-sky-400 text-sm underline">
                {t('common.retry')}
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'waiting' && (
        <>
          <h3 className="font-semibold text-white mb-1">{t('login.tgLoginHeading')}</h3>
          <p className="text-xs text-slate-400 mb-4">{t('login.tgLoginHint')}</p>
          {deepLink ? (
            <>
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-br from-sky-500 to-blue-700 hover:from-sky-400 hover:to-blue-600 text-white text-center font-semibold rounded-xl py-3 mb-4 transition-all active:scale-[0.99]"
              >
                {t('login.tgLoginOpen')}
              </a>
              {qrDataUrl && (
                <>
                  <p className="text-[11px] text-center text-slate-500 mb-2">{t('login.tgLoginScan')}</p>
                  <div className="bg-white rounded-xl p-2 w-44 mx-auto">
                    <img src={qrDataUrl} alt="Telegram login QR" className="w-full h-full" />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl p-3 text-xs">
              {t('login.tgNotConfigured')}
            </div>
          )}
        </>
      )}

      {phase === 'awaiting_admin' && (
        <div className="py-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/15 flex items-center justify-center">
            <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
          </div>
          <p className="text-amber-300 text-sm font-semibold mb-1">{t('login.tgAwaitingAdmin')}</p>
          <p className="text-xs text-slate-400">{t('login.tgAwaitingAdminHint')}</p>
        </div>
      )}

      {phase === 'approved' && (
        <div className="py-6 text-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-500 flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-emerald-400 text-sm font-semibold">{t('login.tgApproved')}</p>
        </div>
      )}

      {(phase === 'rejected' || phase === 'expired') && (
        <div className="py-6 text-center">
          <p className="text-red-400 text-sm font-semibold mb-2">
            {phase === 'rejected' ? t('login.tgRejected') : t('login.tgExpired')}
          </p>
          <button onClick={start} className="text-sky-400 text-sm underline">
            {t('common.retry')}
          </button>
        </div>
      )}
    </div>
  );
}
