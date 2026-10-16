import type { Readable } from 'node:stream';

/** Guarda archivos opacos (ya cifrados en el cliente). */
export interface FileStorage {
  save(fileId: string, data: Buffer): Promise<void>;
  read(fileId: string): Promise<Readable>;
  exists(fileId: string): Promise<boolean>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
