import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENTS,
  blobToDataUrl,
  isImageFile,
  fileToImageAttachment,
  imageFilesFromClipboard,
  remainingSlots,
  canAddAttachment,
  supportsDisplayMedia,
  supportsUserMedia,
  supportsMediaRecorder,
  getSpeechRecognitionCtor,
  supportsSpeechRecognition,
} from './attachments';

describe('attachment slot helpers', () => {
  it('remainingSlots never goes negative', () => {
    expect(remainingSlots(0)).toBe(MAX_ATTACHMENTS);
    expect(remainingSlots(3)).toBe(MAX_ATTACHMENTS - 3);
    expect(remainingSlots(MAX_ATTACHMENTS)).toBe(0);
    expect(remainingSlots(MAX_ATTACHMENTS + 5)).toBe(0);
  });

  it('canAddAttachment respects the cap', () => {
    expect(canAddAttachment(0)).toBe(true);
    expect(canAddAttachment(MAX_ATTACHMENTS - 1)).toBe(true);
    expect(canAddAttachment(MAX_ATTACHMENTS)).toBe(false);
  });
});

describe('isImageFile', () => {
  it('detects image MIME types', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true);
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
  });
  it('rejects non-images / nullish', () => {
    expect(isImageFile({ type: 'audio/webm' })).toBe(false);
    expect(isImageFile({})).toBe(false);
    expect(isImageFile(null)).toBe(false);
    expect(isImageFile(undefined)).toBe(false);
  });
});

describe('blobToDataUrl + fileToImageAttachment', () => {
  it('reads a blob into a data URL', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const url = await blobToDataUrl(blob);
    expect(url.startsWith('data:')).toBe(true);
  });

  it('wraps an image file into an attachment with its name as caption', async () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const att = await fileToImageAttachment(file);
    expect(att.type).toBe('image');
    expect(att.data.startsWith('data:')).toBe(true);
    expect(att.caption).toBe('shot.png');
  });
});

describe('imageFilesFromClipboard', () => {
  function fakeItems(entries: Array<{ kind: string; type: string; file: File | null }>) {
    const items = entries.map((e) => ({
      kind: e.kind,
      type: e.type,
      getAsFile: () => e.file,
    }));
    return Object.assign(items, { length: items.length }) as unknown as DataTransferItemList;
  }

  it('returns [] when there is nothing', () => {
    expect(imageFilesFromClipboard(null)).toEqual([]);
    expect(imageFilesFromClipboard(undefined)).toEqual([]);
  });

  it('keeps only image files', () => {
    const img = new File(['x'], 'a.png', { type: 'image/png' });
    const items = fakeItems([
      { kind: 'file', type: 'image/png', file: img },
      { kind: 'string', type: 'text/plain', file: null },
      { kind: 'file', type: 'application/pdf', file: new File(['y'], 'd.pdf', { type: 'application/pdf' }) },
      { kind: 'file', type: 'image/jpeg', file: null }, // getAsFile null -> skipped
    ]);
    const out = imageFilesFromClipboard(items);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(img);
  });
});

describe('browser capability detection (jsdom = unsupported)', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });

  it('reports no media/recorder/speech support under jsdom', () => {
    expect(supportsDisplayMedia()).toBe(false);
    expect(supportsUserMedia()).toBe(false);
    expect(supportsMediaRecorder()).toBe(false);
    expect(getSpeechRecognitionCtor()).toBeNull();
    expect(supportsSpeechRecognition()).toBe(false);
  });

  it('picks up SpeechRecognition / webkit prefix when present', () => {
    class FakeRec {}
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec;
    expect(getSpeechRecognitionCtor()).toBe(FakeRec);
    expect(supportsSpeechRecognition()).toBe(true);

    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    expect(getSpeechRecognitionCtor()).toBe(FakeRec);
  });
});
