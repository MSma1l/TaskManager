import { useRef, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { QuickTaskAttachment } from '../api/quicktasks';
import {
  blobToDataUrl,
  getSpeechRecognitionCtor,
  supportsMediaRecorder,
  supportsUserMedia,
  SpeechRecognitionLike,
  SpeechRecognitionResultLike,
} from './attachments';

interface Props {
  disabled?: boolean;
  onAudio: (attachment: QuickTaskAttachment) => void;
  onTranscript: (text: string) => void;
}

/**
 * Buton de înregistrare voce. La start pornește SIMULTAN:
 *  (a) MediaRecorder pe microfon → la stop, Blob → data-URL base64 → atașament
 *      AUDIO (previzualizat cu <audio controls>, "ca în chat");
 *  (b) Web Speech API (`ro-RO`, continuous + interimResults) → transcriptul
 *      final e adăugat în textarea de Descriere pe măsură ce userul vorbește.
 * Se ascunde dacă nici înregistrarea, nici speech-to-text nu sunt disponibile.
 */
export default function VoiceRecorder({ disabled, onAudio, onTranscript }: Props) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const canRecord = supportsUserMedia() && supportsMediaRecorder();
  const SpeechRecognition = getSpeechRecognitionCtor();
  if (!canRecord && !SpeechRecognition) return null;

  const start = async () => {
    if (recording || disabled) return;

    // (b) speech-to-text live (best-effort, doar pe browsere compatibile)
    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.lang = 'ro-RO';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event: SpeechRecognitionResultLike) => {
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const r = event.results[i];
            if (r.isFinal) finalText += r[0].transcript;
          }
          if (finalText.trim()) onTranscript(finalText.trim());
        };
        rec.onerror = () => {};
        recognitionRef.current = rec;
        rec.start();
      } catch {
        /* ignore */
      }
    }

    // (a) înregistrare audio
    if (canRecord) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];
        const mr = new MediaRecorder(stream);
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
          try {
            const data = await blobToDataUrl(blob);
            onAudio({ type: 'audio', data, caption: null });
          } catch {
            /* ignore */
          }
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        };
        recorderRef.current = mr;
        mr.start();
      } catch {
        /* ignore */
      }
    }

    setRecording(true);
  };

  const stop = () => {
    setRecording(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
  };

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={disabled && !recording}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
        recording
          ? 'border-red-500 bg-red-500/10 text-red-500'
          : 'border-border bg-elevated text-fg hover:opacity-90'
      }`}
    >
      {recording ? (
        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v3m-4 0h8M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z" />
        </svg>
      )}
      {recording ? t('quick.stop') : t('quick.recordVoice')}
    </button>
  );
}
