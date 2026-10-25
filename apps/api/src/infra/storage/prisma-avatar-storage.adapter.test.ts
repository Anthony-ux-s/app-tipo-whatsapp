import { describe, expect, it } from 'vitest';
import { PrismaAvatarStorage } from './prisma-avatar-storage.adapter';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('PrismaAvatarStorage', () => {
  it('devuelve la foto como bytes (Buffer), no como números sueltos', async () => {
    // Prisma 6 entrega las columnas Bytes como Uint8Array.
    const prisma = { avatarImage: { findUniqueOrThrow: async () => ({ data: jpeg }) } };
    const stream = await new PrismaAvatarStorage(prisma as never).read('av1');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      expect(Buffer.isBuffer(chunk)).toBe(true);
      chunks.push(chunk as Buffer);
    }
    expect([...Buffer.concat(chunks)]).toEqual([...jpeg]);
  });
});
