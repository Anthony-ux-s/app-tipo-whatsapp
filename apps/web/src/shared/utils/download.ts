const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
};

const PREFIXES: Record<string, string> = { image: 'IMG', video: 'VID', audio: 'AUD' };

/** Nombre al estilo de WhatsApp: «Parla-IMG-20261017-153012.jpg», con la fecha del mensaje. */
export function mediaFileName(mimeType: string, sentAt: string | Date): string {
  const [family = '', subtype = ''] = mimeType.split(';')[0]!.trim().toLowerCase().split('/');
  const ext = EXTENSIONS[`${family}/${subtype}`] ?? (subtype.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin');
  const d = new Date(sentAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = Number.isNaN(d.getTime())
    ? 'archivo'
    : `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `Parla-${PREFIXES[family] ?? 'FILE'}-${stamp}.${ext}`;
}

/** Guarda en el dispositivo un archivo ya descifrado (URL blob: local; no vuelve a pasar por el servidor). */
export function saveFile(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
