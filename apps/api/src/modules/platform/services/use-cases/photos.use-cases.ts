import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { FILE_STORAGE, type FileStorage } from '../../../../infra/storage/file-storage.port';
import { NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { isJpeg } from '../../../../kernel/images';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders.repository';
import { PHOTOS_REPOSITORY, type PhotosRepository } from '../photos.repository';

/** El navegador reduce la foto (lado mayor 1600 px) y la pasa a JPEG sin datos EXIF ni GPS. */
export const MAX_PHOTO_BYTES = 1024 * 1024;
const PHOTO_ID = /^ph[a-f0-9]{32}$/;

/**
 * Sube una foto privada (documento del repartidor, foto de entrega o de un reclamo). Devuelve su id
 * para adjuntarla después; nadie la puede ver hasta que se adjunta, y solo quien participa.
 */
@Injectable()
export class UploadPhotoUseCase {
  constructor(
    @Inject(PHOTOS_REPOSITORY) private readonly photos: PhotosRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async execute(userId: string, data: Buffer | undefined): Promise<{ photoId: string }> {
    if (!data || data.length === 0) throw new ValidationError('Elige una foto');
    if (data.length > MAX_PHOTO_BYTES) throw new ValidationError('La foto es muy pesada (máximo 1 MB)');
    if (!isJpeg(data)) throw new ValidationError('La foto debe ser una imagen JPEG');
    const photoId = `ph${randomBytes(16).toString('hex')}`;
    await this.storage.save(photoId, data);
    await this.photos.create(photoId, userId);
    return { photoId };
  }
}

/** Solo quien subió la foto puede adjuntarla (nadie puede usar la foto de otro como prueba). */
export async function assertOwnPhoto(photos: PhotosRepository, userId: string, photoId: string): Promise<void> {
  if (!PHOTO_ID.test(photoId) || (await photos.uploaderOf(photoId)) !== userId) throw new ValidationError('La foto no es válida; vuelve a subirla');
}

/** Lee una foto ya autorizada por quien la pide (cada ruta comprueba antes quién puede verla). */
@Injectable()
export class ReadPhotoUseCase {
  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  async execute(photoId: string | null): Promise<Readable> {
    if (!photoId || !PHOTO_ID.test(photoId) || !(await this.storage.exists(photoId))) throw new NotFoundError('Foto no encontrada');
    return this.storage.read(photoId);
  }
}

/**
 * Qué foto de un pedido puede ver quien la pide: la de entrega, el cliente, la tienda, el repartidor
 * del pedido y soporte; la de un reclamo, el cliente, la tienda y soporte. Para cualquier otro, 404.
 */
@Injectable()
export class GetOrderPhotoUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
  ) {}

  async execute(viewerId: string, orderId: string, claimId?: string): Promise<string | null> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Pedido no encontrado');
    const isCustomer = order.userId === viewerId;
    const isOwner = order.business?.ownerId === viewerId;
    const isDriver = !claimId && order.driverId === viewerId;
    const [viewer] = isCustomer || isOwner || isDriver ? [null] : await this.users.findActiveByIds([viewerId]);
    if (!isCustomer && !isOwner && !isDriver && !viewer?.isAdmin) throw new NotFoundError('Foto no encontrada');
    if (!claimId) return order.deliveryPhotoId;
    return order.claims.find((c) => c.id === claimId)?.photoId ?? null;
  }
}
