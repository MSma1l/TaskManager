import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { QuickTaskAttachment } from '../api/quicktasks';
import { supportsDisplayMedia } from './attachments';

interface Props {
  disabled?: boolean;
  onCapture: (attachment: QuickTaskAttachment) => void;
}

/**
 * Buton "Capturează ecran": folosește `getDisplayMedia` → desenează un cadru pe
 * un <canvas> → `toDataURL('image/png')` → atașament imagine, apoi oprește
 * stream-ul. Se ascunde complet dacă API-ul nu există (jsdom / browsere vechi).
 */
export default function ScreenshotInput({ disabled, onCapture }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  if (!supportsDisplayMedia()) return null;

  const capture = async () => {
    if (busy || disabled) return;
    setBusy(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // mic delay ca primul cadru să fie disponibil
      await new Promise((r) => setTimeout(r, 250));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/png');
        onCapture({ type: 'image', data, caption: 'screenshot.png' });
      }
      video.pause();
    } catch {
      /* utilizatorul a anulat sau API indisponibil — ignorăm */
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={capture}
      disabled={disabled || busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-elevated text-fg px-3 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      {busy ? t('quick.capturing') : t('quick.captureScreen')}
    </button>
  );
}
