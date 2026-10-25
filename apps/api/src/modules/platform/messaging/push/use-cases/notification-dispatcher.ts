import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PushPayload } from '@parla/types';
import { PUSH_SENDER, type PushSender } from '../../../../../infra/push/push-sender.port';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { PUSH_SUBSCRIPTIONS_REPOSITORY, type PushSubscriptionsRepository } from '../push-subscriptions.repository';

/**
 * Envía push a todos los dispositivos suscritos, como WhatsApp. No se filtra por «conectado»: una app en segundo
 * plano en el celular sigue figurando conectada un rato aunque el sistema ya la congeló y no mostraría nada.
 * Quien tiene Parla a la vista no ve el aviso: el service worker lo omite si hay una ventana visible.
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
      const targets = await this.subscriptions.listForUsers([...new Set(userIds)]);
      const results = await Promise.all(
        targets.map(async (target) => {
          const result = await this.sender.send(target, payloadFor(target.userId));
          if (result === 'gone') await this.subscriptions.removeByEndpoint(target.endpoint);
          return result;
        }),
      );
      const sent = results.filter((r) => r === 'sent').length;
      if (targets.length > 0 || userIds.length > 0) this.logger.log(`push: ${new Set(userIds).size} destinatarios, ${targets.length} dispositivos, ${sent} enviados`);
      return sent;
    } catch (error) {
      this.logger.error(error);
      return 0;
    }
  }
}
