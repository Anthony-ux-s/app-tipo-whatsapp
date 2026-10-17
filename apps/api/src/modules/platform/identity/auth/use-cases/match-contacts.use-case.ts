import { Inject, Injectable } from '@nestjs/common';
import type { ContactMatch } from '@parla/types';
import { NotFoundError } from '../../../../../kernel/domain-error';
import { callingCodeOf, normalizeContactPhone } from '../../../../../kernel/phone';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { toPublicUser } from '../../user.mapper';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

export const MAX_CONTACTS = 2000;

/**
 * ¿Quiénes de mi libreta ya están en Parla? Los números llegan, se cruzan y se descartan: no se
 * guardan ni se usan para nada más (ver política de privacidad).
 */
@Injectable()
export class MatchContactsUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(userId: string, phones: string[]): Promise<ContactMatch[]> {
    const me = await this.users.findById(userId);
    if (!me) throw new NotFoundError('Usuario no encontrado');
    // Los números guardados sin indicativo se completan con el del propio teléfono.
    const defaultCode = me.phone ? callingCodeOf(me.phone) : null;
    const byE164 = new Map<string, string>();
    for (const raw of phones.slice(0, MAX_CONTACTS)) {
      const e164 = normalizeContactPhone(raw, defaultCode);
      if (e164 && e164 !== me.phone && !byE164.has(e164)) byE164.set(e164, raw);
    }
    const found = await this.users.findActiveByPhones([...byE164.keys()]);
    return found
      .map((user) => ({ phone: byE164.get(user.phone!)!, user: toPublicUser(user, this.presence.statusOf(user.id)) }))
      .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName, 'es'));
  }
}
