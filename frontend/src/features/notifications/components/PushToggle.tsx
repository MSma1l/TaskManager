import { useEffect, useState } from 'react';
import client from '../../../shared/api/client';
import { useT } from '../../../shared/i18n/I18nProvider';

/**
 * Comutator pentru notificari Web Push (VAPID + Service Worker).
 *
 * Cere permisiunea browserului, se aboneaza prin pushManager.subscribe() folosind
 * applicationServerKey de la /api/push/public-key, apoi trimite abonamentul la
 * /api/push/subscribe. Dezactivarea face unsubscribe local + /api/push/unsubscribe.
 *
 * Push-ul ajunge chiar cu aplicatia INCHISA (handler-ul `push` din sw.js afiseaza
 * notificarea). Daca serverul nu are chei VAPID configurate, componenta afiseaza
 * un mesaj ca push-ul nu e disponibil.
 */

const PUSH_SUPPORTED =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export default function PushToggle() {
  const t = useT();
  const [enabled, setEnabled] = useState(false);     // exista un abonament push activ
  const [available, setAvailable] = useState(false);  // serverul are chei VAPID
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    setDenied(Notification.permission === 'denied');

    // serverul are push configurat?
    client.get('/push/public-key').then((r) => {
      setAvailable(!!r.data?.enabled && !!r.data?.publicKey);
    }).catch(() => setAvailable(false));

    // exista deja un abonament?
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});
  }, []);

  const enable = async () => {
    setErr('');
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setDenied(permission === 'denied');
        setErr(t('push.permissionDenied'));
        return;
      }

      const keyResp = await client.get('/push/public-key');
      const publicKey: string = keyResp.data?.publicKey || '';
      if (!publicKey) {
        setAvailable(false);
        setErr(t('push.unavailable'));
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await client.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });
      setEnabled(true);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('push.error'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setErr('');
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        await client.post('/push/unsubscribe', { endpoint }).catch(() => {});
      }
      setEnabled(false);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('push.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!PUSH_SUPPORTED) {
    return <p className="text-xs text-muted">{t('push.notSupported')}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm">{t('push.title')}</p>
          <p className="text-xs text-muted">{t('push.hint')}</p>
        </div>
        <button
          type="button"
          onClick={enabled ? disable : enable}
          disabled={busy || (!available && !enabled) || denied}
          className={`rounded-lg px-3 py-2 text-sm disabled:opacity-50 ${
            enabled
              ? 'bg-red-600/15 hover:bg-red-600/25 text-red-500'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {busy ? t('push.working') : enabled ? t('push.disable') : t('push.enable')}
        </button>
      </div>
      {enabled && <p className="text-xs text-emerald-500">{t('push.active')}</p>}
      {denied && <p className="text-xs text-amber-500">{t('push.blocked')}</p>}
      {!available && !enabled && !denied && <p className="text-xs text-muted">{t('push.unavailable')}</p>}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}
