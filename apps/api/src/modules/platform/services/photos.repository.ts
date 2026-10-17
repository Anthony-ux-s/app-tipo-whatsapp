/** Quién subió cada foto privada (documento, entrega, reclamo): solo su dueño puede adjuntarla. */
export interface PhotosRepository {
  create(id: string, uploaderId: string): Promise<void>;
  /** El dueño de la foto, o null si no existe. */
  uploaderOf(id: string): Promise<string | null>;
}

export const PHOTOS_REPOSITORY = Symbol('PHOTOS_REPOSITORY');
