import { http } from './http';
import { toPhotoJpeg } from './image';

/** Sube una foto privada (POST /photos) y devuelve su id para adjuntarla a un documento, entrega o reclamo. */
export async function uploadPhoto(file: Blob): Promise<string> {
  const form = new FormData();
  form.append('file', await toPhotoJpeg(file), 'foto.jpg');
  const { photoId } = await http.upload<{ photoId: string }>('/photos', form);
  return photoId;
}
