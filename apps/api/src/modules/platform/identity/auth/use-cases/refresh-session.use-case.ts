import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, UnauthorizedError } from '../../../../../kernel/domain-error';
import { TOKEN_SERVICE, type TokenService } from '../../../../../infra/identity/token-service.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

/**
 * Renueva la sesión: quien sigue usando Parla no tiene que volver a entrar. La app lo pide al abrirse y cada
 * tanto; cada renovación vuelve a dar toda la vigencia del token. Solo se cierra si la persona cierra sesión,
 * si borra su cuenta o si pasa el tiempo completo sin abrir la app.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  async execute(userId: string): Promise<{ token: string }> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedError('Tu cuenta ya no existe');
    if (user.blockedAt) throw new ForbiddenError('Tu cuenta está suspendida. Escríbenos a soporte para revisarla.');
    return { token: await this.tokens.issue(user.id) };
  }
}
