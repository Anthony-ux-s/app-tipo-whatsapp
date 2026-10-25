import { Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import type { FileStorage } from './file-storage.port';

/** Fotos de perfil en la base de datos: sobreviven a los despliegues aunque el hosting borre el disco. */
@Injectable()
export class PrismaAvatarStorage implements FileStorage {
  constructor(private readonly prisma: PrismaService) {}

  async save(fileId: string, data: Buffer): Promise<void> {
    await this.prisma.avatarImage.create({ data: { id: fileId, data: new Uint8Array(data) } });
  }

  async read(fileId: string): Promise<Readable> {
    const row = await this.prisma.avatarImage.findUniqueOrThrow({ where: { id: fileId }, select: { data: true } });
    // Prisma entrega los bytes como Uint8Array: Readable.from() la recorre número por número y corta la respuesta. Se envía como un solo Buffer.
    return Readable.from([Buffer.from(row.data)]);
  }

  async exists(fileId: string): Promise<boolean> {
    return (await this.prisma.avatarImage.count({ where: { id: fileId } })) > 0;
  }
}
