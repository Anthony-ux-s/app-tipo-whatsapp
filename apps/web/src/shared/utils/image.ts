const AVATAR_SIZE = 512;
const MAX_BYTES = 280 * 1024;

/**
 * Foto de perfil lista para subir: recorte cuadrado al centro, 512×512 y JPEG. Al redibujarla en un
 * canvas se pierden los metadatos (EXIF, ubicación GPS del celular).
 */
export async function toAvatarJpeg(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Elige una imagen');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('No pudimos abrir esa imagen. Prueba con otra.');
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();

  for (const quality of [0.88, 0.8, 0.7, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('La foto es muy pesada. Prueba con otra.');
}

const PHOTO_MAX_SIDE = 1600;
const PHOTO_MAX_BYTES = 900 * 1024;

/**
 * Foto de evidencia (documento, entrega o reclamo) lista para subir: como mucho 1600 px por lado y
 * JPEG de menos de 900 KB, sin metadatos (EXIF ni ubicación GPS).
 */
export async function toPhotoJpeg(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Elige una imagen');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('No pudimos abrir esa imagen. Prueba con otra.');
  });
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= PHOTO_MAX_BYTES) return blob;
  }
  throw new Error('La foto es muy pesada. Prueba con otra.');
}
