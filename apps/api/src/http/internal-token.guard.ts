import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { APP_ENV, type AppEnv } from '../config/env.validation';

/**
 * Rutas entre servicios (/api/internal/*): exigen el token interno compartido.
 * Además, el gateway nunca las expone hacia fuera (responde 404).
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const given = Buffer.from(request.headers['x-internal-token'] ?? '');
    const expected = Buffer.from(this.env.internalToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('Token interno inválido');
    }
    return true;
  }
}
