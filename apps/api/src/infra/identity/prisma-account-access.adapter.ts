import { Injectable } from '@nestjs/common';
import { limaDay } from '../../kernel/traffic';
import { PrismaService } from '../prisma/prisma.service';
import type { AccountAccess } from './account-access.port';

/** Cuánto se confía en lo guardado de una cuenta antes de volver a mirar la base. */
const CHECK_EVERY_MS = 30_000;
/** Una «visita» nueva si pasó al menos esto desde la anterior (abrir la app, no cada petición). */
const VISIT_GAP_MS = 30 * 60_000;

@Injectable()
export class PrismaAccountAccess implements AccountAccess {
  private readonly seen = new Map<string, { blocked: boolean; checkedAt: number; visitAt: number; day: string }>();

  constructor(private readonly prisma: PrismaService) {}

  async allow(userId: string): Promise<boolean> {
    const now = Date.now();
    const day = limaDay(new Date(now));
    let entry = this.seen.get(userId);
    if (!entry || now - entry.checkedAt > CHECK_EVERY_MS) {
      const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { blockedAt: true } });
      entry = { blocked: !!row?.blockedAt, checkedAt: now, visitAt: entry?.visitAt ?? 0, day: entry?.day ?? '' };
      this.seen.set(userId, entry);
    }
    if (entry.blocked) return false;
    if (now - entry.visitAt > VISIT_GAP_MS || entry.day !== day) {
      entry.visitAt = now;
      entry.day = day;
      // Si falla, no se corta la petición: el tráfico es informativo.
      await this.prisma.userActivityDay
        .upsert({ where: { userId_day: { userId, day } }, create: { userId, day }, update: { visits: { increment: 1 } } })
        .catch(() => undefined);
    }
    return true;
  }

  forget(userId: string): void {
    this.seen.delete(userId);
  }
}
