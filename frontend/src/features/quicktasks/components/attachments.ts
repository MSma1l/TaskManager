import { QuickTaskAttachment } from '../api/quicktasks';

/**
 * Tip minimal pentru Web Speech API — nu există în lib.dom standard, deci îl
 * declarăm noi cu doar ce folosim (lang/continuous/interimResults + handlere).
 */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionResultLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

/** Numărul maxim de atașamente acceptat de backend pentru un quick task public. */
export const MAX_ATTACHMENTS = 10;

/**
 * Citește un Blob/File într-un data-URL base64 (ex: `data:image/png;base64,...`).
 * Folosit pentru imagini (fișier / paste / screenshot) și pentru nota vocală.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/** True dacă fișierul are un MIME type de imagine. */
export function isImageFile(file: { type?: string } | null | undefined): boolean {
  return !!file && typeof file.type === 'string' && file.type.startsWith('image/');
}

/** Transformă un fișier imagine într-un atașament gata de trimis. */
export async function fileToImageAttachment(file: File): Promise<QuickTaskAttachment> {
  const data = await blobToDataUrl(file);
  return { type: 'image', data, caption: file.name || null };
}

/** Extrage fișierele imagine dintr-un eveniment de paste (clipboard). Pur. */
export function imageFilesFromClipboard(
  items: DataTransferItemList | null | undefined,
): File[] {
  if (!items) return [];
  const out: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it && it.kind === 'file' && typeof it.type === 'string' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

/** Câte atașamente mai pot fi adăugate (0..MAX_ATTACHMENTS). */
export function remainingSlots(current: number): number {
  return Math.max(0, MAX_ATTACHMENTS - current);
}

/** True cât timp mai e loc pentru cel puțin un atașament. */
export function canAddAttachment(current: number): boolean {
  return current < MAX_ATTACHMENTS;
}

/** True dacă browserul expune `getDisplayMedia` (captură ecran). */
export function supportsDisplayMedia(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}

/** True dacă browserul expune `getUserMedia` (microfon). */
export function supportsUserMedia(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** True dacă browserul expune `MediaRecorder`. */
export function supportsMediaRecorder(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

/** Constructorul Web Speech API (Chrome/Edge), sau `null` dacă lipsește. */
export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True dacă speech-to-text live e disponibil. */
export function supportsSpeechRecognition(): boolean {
  return getSpeechRecognitionCtor() != null;
}
