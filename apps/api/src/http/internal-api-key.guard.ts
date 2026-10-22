import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { APP_ENV, type AppEnv } from '../config/env.validation';

/**
 * La API de tienda que sirve el core (/api/internal/store-api/*): el gateway la llama con el token interno
 * en `x-api-key` (así es como habla con cualquier tienda). El gateway nunca la expone hacia fuera.
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const given = Buffer.from(request.headers['x-api-key'] ?? '');
    const expected = Buffer.from(this.env.internalToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException('Clave de API inválida');
    return true;
  }
}
