import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { PhotosRepository } from './photos.repository';

@Injectable()
export class PrismaPhotosRepository implements PhotosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(id: string, uploaderId: string): Promise<void> {
    await this.prisma.uploadedPhoto.create({ data: { id, uploaderId } });
  }

  async uploaderOf(id: string): Promise<string | null> {
    const row = await this.prisma.uploadedPhoto.findUnique({ where: { id }, select: { uploaderId: true } });
    return row?.uploaderId ?? null;
  }
}
