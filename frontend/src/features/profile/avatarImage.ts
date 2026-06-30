/**
 * Helperi pentru pregătirea pozei de profil înainte de upload.
 *
 * Backend-ul limitează base64-ul la ~400000 caractere (~300KB), deci redimensionăm
 * și comprimăm poza pe client (canvas → JPEG) înainte să o trimitem. Returnăm un
 * `data:image/jpeg;base64,...` gata de pus în `authApi.updateMe({ avatar })`.
 */

/** Pragul de siguranță pentru lungimea base64 (sub plafonul backend de 400000). */
export const MAX_AVATAR_DATAURL_LEN = 380000;

/** Citește un Blob/File într-un data-URL base64. */
function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/** Încarcă un data-URL într-un HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/**
 * Redimensionează o imagine la cel mult `maxSize`×`maxSize` (păstrând proporțiile)
 * și o exportă JPEG cu calitatea dată, ca data-URL base64.
 */
function drawToJpeg(img: HTMLImageElement, maxSize: number, quality: number): string {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Transformă un fișier imagine ales de user într-un avatar mic (data-URL JPEG).
 * Începe la 256px / calitate 0.85 și, dacă rezultatul depășește plafonul,
 * scade progresiv calitatea apoi dimensiunea până intră sub limită.
 *
 * Aruncă eroare dacă fișierul nu e imagine sau nu poate fi comprimat suficient.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not an image');
  }
  const src = await readAsDataUrl(file);
  const img = await loadImage(src);

  const sizes = [256, 192, 128];
  const qualities = [0.85, 0.7, 0.55, 0.4];
  for (const size of sizes) {
    for (const q of qualities) {
      const dataUrl = drawToJpeg(img, size, q);
      if (dataUrl.length <= MAX_AVATAR_DATAURL_LEN) return dataUrl;
    }
  }
  throw new Error('avatar too large');
}
