import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PushPayload } from '@parla/types';
import { PUSH_SENDER, type PushSender } from '../../../../../infra/push/push-sender.port';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { PUSH_SUBSCRIPTIONS_REPOSITORY, type PushSubscriptionsRepository } from '../push-subscriptions.repository';

/**
 * Envía push solo a quien no tiene Parla abierta: con la app abierta, el navegador ya recibe el
 * mensaje por el socket y muestra su propia notificación (con el texto descifrado).
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger('NotificationDispatcher');

  constructor(
    @Inject(PUSH_SUBSCRIPTIONS_REPOSITORY) private readonly subscriptions: PushSubscriptionsRepository,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    private readonly presence: PresenceRegistry,
  ) {}

  /** Devuelve a cuántos navegadores se envió. Nunca lanza: una notificación fallida no rompe el envío. */
  async notify(userIds: string[], payloadFor: (userId: string) => PushPayload): Promise<number> {
    try {
      const offline = [...new Set(userIds)].filter((id) => this.presence.statusOf(id) === 'offline');
      const targets = await this.subscriptions.listForUsers(offline);
      const results = await Promise.all(
        targets.map(async (target) => {
          const result = await this.sender.send(target, payloadFor(target.userId));
          if (result === 'gone') await this.subscriptions.removeByEndpoint(target.endpoint);
          return result;
        }),
      );
      return results.filter((r) => r === 'sent').length;
    } catch (error) {
      this.logger.error(error);
      return 0;
    }
  }
}
