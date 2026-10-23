import { Inject, Injectable } from '@nestjs/common';
import type { SessionUser } from '@parla/types';
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { NotFoundError, ValidationError } from '../../../../../kernel/domain-error';
import { isJpeg } from '../../../../../kernel/images';
import { AVATAR_STORAGE, type FileStorage } from '../../../../../infra/storage/file-storage.port';
import { toSessionUser } from '../../user.mapper';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';
import { ProfileEvents } from './update-profile.use-case';

/** El navegador recorta la foto a 512×512 y la pasa a JPEG (sin datos EXIF ni GPS) antes de subirla. */
export const MAX_AVATAR_BYTES = 300 * 1024;
const AVATAR_ID = /^av[a-f0-9]{32}$/;

@Injectable()
export class UploadAvatarUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(AVATAR_STORAGE) private readonly storage: FileStorage,
    private readonly events: ProfileEvents,
  ) {}

  async execute(userId: string, data: Buffer | undefined): Promise<SessionUser> {
    if (!data || data.length === 0) throw new ValidationError('Elige una foto');
    if (data.length > MAX_AVATAR_BYTES) throw new ValidationError('La foto es muy pesada');
    if (!isJpeg(data)) throw new ValidationError('La foto debe ser una imagen JPEG');
    // Nombre nuevo en cada cambio: las fotos se guardan en caché sin miedo a mostrar una vieja.
    const fileId = `av${randomBytes(16).toString('hex')}`;
    await this.storage.save(fileId, data);
    const updated = await this.users.update(userId, { avatarFileId: fileId });
    await this.events.changed(updated);
    return toSessionUser(updated, 'online');
  }
}

@Injectable()
export class RemoveAvatarUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: ProfileEvents,
  ) {}

  async execute(userId: string): Promise<SessionUser> {
    const updated = await this.users.update(userId, { avatarFileId: null });
    await this.events.changed(updated);
    return toSessionUser(updated, 'online');
  }
}

@Injectable()
export class ReadAvatarUseCase {
  constructor(@Inject(AVATAR_STORAGE) private readonly storage: FileStorage) {}

  async execute(fileId: string): Promise<Readable> {
    if (!AVATAR_ID.test(fileId) || !(await this.storage.exists(fileId))) throw new NotFoundError('Foto no encontrada');
    return this.storage.read(fileId);
  }
}
