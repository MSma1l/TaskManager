import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { Attachment } from '../api/attachment';

interface TaskAttachmentsProps {
  attachments: Attachment[];
  className?: string;
}

/**
 * Afișează atașamentele unui task: imaginile ca thumbnail-uri într-un grid
 * (click → lightbox full-screen cu zoom) și notele vocale ca player audio nativ.
 * Nu randează nimic dacă nu există atașamente.
 */
export default function TaskAttachments({ attachments, className }: TaskAttachmentsProps) {
  const t = useT();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.type === 'image');
  const audios = attachments.filter((a) => a.type === 'audio');

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-wider text-muted mb-2">
        {t('attachments.heading')}
      </p>

      <div className="space-y-3">
        {images.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((att, i) => (
              <button
                key={`img-${i}`}
                type="button"
                onClick={() => setLightboxIndex(i)}
                title={att.caption || t('attachments.image')}
                className="rounded-lg border border-border overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <img
                  src={att.data}
                  alt={att.caption || t('attachments.image')}
                  className="h-20 w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {audios.map((att, i) => (
          <div key={`aud-${i}`} className="rounded-lg border border-border bg-elevated p-2">
            <p className="text-xs text-muted mb-1">{att.caption || t('attachments.voiceNote')}</p>
            <audio controls src={att.data} className="w-full" />
          </div>
        ))}
      </div>

      {lightboxIndex !== null && images[lightboxIndex] && (
        <Lightbox
          attachment={images[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

// ── Lightbox full-screen cu zoom ─────────────────────────────────────────────

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

function Lightbox({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}) {
  const t = useT();
  const [zoom, setZoom] = useState(1);

  // Închide cu tasta Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));
  const reset = () => setZoom(1);

  // Dublu-click pe imagine: comută între mărit și mărime normală.
  const toggleZoom = () => setZoom((z) => (z > 1 ? 1 : 2));

  const btn =
    'w-10 h-10 flex items-center justify-center rounded-xl bg-surface/90 border border-border text-fg hover:bg-elevated transition-colors disabled:opacity-40';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
    >
      {/* Bara de control */}
      <div
        className="absolute top-4 right-4 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label={t('attachments.zoomOut')} title={t('attachments.zoomOut')} className={btn}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label={t('attachments.zoomIn')} title={t('attachments.zoomIn')} className={btn}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button type="button" onClick={reset} disabled={zoom === 1} aria-label={t('attachments.zoomReset')} title={t('attachments.zoomReset')} className={`${btn} text-xs font-semibold`}>
          1:1
        </button>
        <button type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')} className={btn}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Imaginea (scroll când e mărită) */}
      <div
        className="max-h-[92vh] max-w-[92vw] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={attachment.data}
          alt={attachment.caption || t('attachments.image')}
          onDoubleClick={toggleZoom}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className={`max-h-[88vh] max-w-[88vw] rounded-lg object-contain transition-transform duration-150 ${
            zoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'
          }`}
        />
      </div>

      {/* Caption */}
      {attachment.caption && (
        <p
          className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[90vw] text-center text-sm text-white/90 bg-black/50 rounded-lg px-3 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {attachment.caption}
        </p>
      )}
    </div>
  );
}
