import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limita por IP y, en el inicio de sesión, también por cuenta: frena la fuerza bruta contra una
 * cuenta sin bloquear a todo un equipo que comparte la misma IP (una oficina, una VPN).
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = (req.ip as string | undefined) ?? 'desconocida';
    const body = req.body as { identifier?: unknown } | undefined;
    const account = typeof body?.identifier === 'string' ? body.identifier.replace(/\s/g, '').toLowerCase() : '';
    return account ? `${ip}|${account}` : ip;
  }
}
