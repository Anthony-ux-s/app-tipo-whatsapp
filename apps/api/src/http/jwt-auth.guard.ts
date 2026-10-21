import { ForbiddenException, Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCOUNT_ACCESS, type AccountAccess } from '../infra/identity/account-access.port';
import { TOKEN_SERVICE, type TokenService } from '../infra/identity/token-service.port';
import { IS_PUBLIC } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(ACCOUNT_ACCESS) private readonly access: AccountAccess,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Inicia sesión para continuar');

    const userId = await this.tokens.verify(token);
    if (!userId) throw new UnauthorizedException('Tu sesión expiró, vuelve a iniciar sesión');
    if (!(await this.access.allow(userId))) throw new ForbiddenException('Tu cuenta está suspendida. Escríbenos a soporte para revisarla.');
    request.user = { userId };
    return true;
  }
}
