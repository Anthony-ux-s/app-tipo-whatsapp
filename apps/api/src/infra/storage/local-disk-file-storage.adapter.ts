import { Inject, Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { APP_ENV, type AppEnv } from '../../config/env.validation';
import type { FileStorage } from './file-storage.port';

@Injectable()
export class LocalDiskFileStorage implements FileStorage {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  private pathFor(fileId: string): string {
    if (!/^[a-z0-9]+$/i.test(fileId)) throw new Error('Identificador de archivo inválido');
    return join(this.env.storageDir, `${fileId}.bin`);
  }

  async save(fileId: string, data: Buffer): Promise<void> {
    await mkdir(this.env.storageDir, { recursive: true });
    await writeFile(this.pathFor(fileId), data);
  }

  async read(fileId: string): Promise<Readable> {
    return createReadStream(this.pathFor(fileId));
  }

  async exists(fileId: string): Promise<boolean> {
    try {
      await access(this.pathFor(fileId));
      return true;
    } catch {
      return false;
    }
  }
}
