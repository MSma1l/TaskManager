import { ChangeEvent, ClipboardEvent, FormEvent, useState } from 'react';
import { useI18n } from '../../../shared/i18n/I18nProvider';
import { QuickTaskAttachment, quickTasksApi } from '../api/quicktasks';
import {
  canAddAttachment,
  fileToImageAttachment,
  imageFilesFromClipboard,
  remainingSlots,
} from '../components/attachments';
import ScreenshotInput from '../components/ScreenshotInput';
import VoiceRecorder from '../components/VoiceRecorder';

/**
 * Formular public de creare task rapid (FARA login).
 * Nume+Prenume, un singur câmp Mesaj și un toggle "Urgent". Statusul e implicit "Nou".
 * În plus: atașamente imagine (fișier / paste / captură ecran) și notă vocală
 * (înregistrare audio + transcript live în câmpul Mesaj).
 * Se poate trimite cu nume + (mesaj SAU cel puțin un atașament).
 */
export default function PublicQuickTaskPage() {
  const { t, lang, setLang } = useI18n();
  const [requesterName, setRequesterName] = useState('');
  const [message, setMessage] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [attachments, setAttachments] = useState<QuickTaskAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const addAttachment = (attachment: QuickTaskAttachment) => {
    setAttachments((prev) => (canAddAttachment(prev.length) ? [...prev, attachment] : prev));
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const appendTranscript = (text: string) => {
    setMessage((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${text}` : text));
  };

  const handleImageFiles = async (files: File[]) => {
    for (const file of files) {
      // Re-citim lungimea curentă la fiecare iterație prin closure-ul async:
      // limităm la MAX_ATTACHMENTS folosind starea cea mai recentă.
      // eslint-disable-next-line no-await-in-loop
      const attachment = await fileToImageAttachment(file);
      setAttachments((prev) => (canAddAttachment(prev.length) ? [...prev, attachment] : prev));
    }
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) void handleImageFiles(files);
    e.target.value = '';
  };

  const onPaste = (e: ClipboardEvent<HTMLFormElement>) => {
    const files = imageFilesFromClipboard(e.clipboardData?.items);
    if (files.length) void handleImageFiles(files);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!requesterName.trim() || (!message.trim() && attachments.length === 0)) {
      setError(t('quick.errorRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await quickTasksApi.submitPublic({
        requesterName: requesterName.trim(),
        ...(message.trim() ? { title: message.trim() } : {}),
        priority: urgent ? 'URGENT' : 'NORMAL',
        ...(attachments.length ? { attachments } : {}),
      });
      setDone(true);
    } catch {
      setError(t('quick.errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setRequesterName('');
    setMessage('');
    setUrgent(false);
    setAttachments([]);
    setDone(false);
    setError(null);
  };

  const slotsLeft = remainingSlots(attachments.length);

  return (
    <div className="min-h-screen bg-bg text-fg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Selector limbă pentru vizitatorul anonim (RO / RU) */}
        <div className="flex justify-end mb-3">
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
            {(['ro', 'ru'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l, { syncRemote: false })}
                aria-pressed={lang === l}
                className={`px-3 py-1.5 transition ${
                  lang === l ? 'bg-blue-600 text-white' : 'bg-elevated text-muted hover:text-fg'
                }`}
              >
                {l === 'ro' ? 'RO' : 'RU'}
              </button>
            ))}
          </div>
        </div>
        {done ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-3xl">
              ✓
            </div>
            <h1 className="text-xl font-bold tracking-tight mb-2">{t('quick.successTitle')}</h1>
            <p className="text-muted text-sm mb-6">{t('quick.successBody')}</p>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              {t('quick.submitAnother')}
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            onPaste={onPaste}
            className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm"
          >
            <h1 className="text-2xl font-bold tracking-tight mb-1">{t('quick.publicTitle')}</h1>
            <p className="text-muted text-sm mb-6">{t('quick.publicSubtitle')}</p>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {error}
              </div>
            )}

            <label className="block mb-4">
              <span className="block text-sm font-medium mb-0.5">{t('quick.nameLabel')}</span>
              <span className="block text-xs text-muted mb-1.5">{t('quick.nameHint')}</span>
              <input
                type="text"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder={t('quick.namePlaceholder')}
                className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                maxLength={150}
              />
            </label>

            <div className="mb-6">
              <span className="block text-sm font-medium mb-0.5">{t('quick.titleLabel')}</span>
              <span className="block text-xs text-muted mb-1.5">{t('quick.titleHint')}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('quick.titlePlaceholder')}
                rows={4}
                className="w-full rounded-t-lg bg-input border border-border border-b-0 px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y"
              />
              {/* Bara de atașamente lipită sub descriere: o captură/imagine sau o
                  notă vocală merg direct la descriere, pentru comoditate. */}
              <div className="flex flex-wrap items-center gap-2 rounded-b-lg border border-border bg-elevated px-2 py-2">
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-elevated text-fg px-3 py-2 text-sm font-medium hover:opacity-90 transition cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {t('quick.attachImage')}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onFileInput}
                    disabled={slotsLeft === 0}
                    className="hidden"
                  />
                </label>
                <ScreenshotInput disabled={slotsLeft === 0} onCapture={addAttachment} />
                <VoiceRecorder
                  disabled={slotsLeft === 0}
                  onAudio={addAttachment}
                  onTranscript={appendTranscript}
                />
              </div>
              <p className="text-xs text-muted mt-1.5">{t('quick.screenshotHint')}</p>

              {attachments.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {attachments.map((att, i) => (
                    <div
                      key={`${att.type}-${i}`}
                      className="relative rounded-lg border border-border bg-elevated overflow-hidden"
                    >
                      {att.type === 'image' ? (
                        <img
                          src={att.data}
                          alt={att.caption || t('quick.attachImage')}
                          className="h-24 w-full object-cover"
                        />
                      ) : (
                        <div className="p-2">
                          <p className="text-xs text-muted mb-1">{t('quick.voiceNote')}</p>
                          <audio controls src={att.data} className="w-full" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        aria-label={t('quick.removeAttachment')}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white text-sm leading-none flex items-center justify-center hover:bg-black/80"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="mb-6 flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="h-4 w-4 rounded border-border text-red-600 focus:ring-2 focus:ring-red-500/50"
              />
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                {t('quick.urgentLabel')}
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? t('quick.submitting') : t('quick.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
