import { Inject, Injectable } from '@nestjs/common';
import type { PushSubscriptionRequest } from '@parla/types';
import { ValidationError } from '../../../../../kernel/domain-error';
import { PUSH_SENDER, type PushSender } from '../../../../../infra/push/push-sender.port';
import { PUSH_SUBSCRIPTIONS_REPOSITORY, type PushSubscriptionsRepository } from '../push-subscriptions.repository';

/** Activar o desactivar las notificaciones push de un navegador. */
@Injectable()
export class ManageSubscriptionUseCase {
  constructor(
    @Inject(PUSH_SUBSCRIPTIONS_REPOSITORY) private readonly subscriptions: PushSubscriptionsRepository,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  publicKey(): { publicKey: string } {
    return { publicKey: this.sender.publicKey() };
  }

  async subscribe(userId: string, input: PushSubscriptionRequest): Promise<{ subscribed: true }> {
    let url: URL;
    try {
      url = new URL(input.endpoint);
    } catch {
      throw new ValidationError('La suscripción push no es válida');
    }
    if (url.protocol !== 'https:') throw new ValidationError('La suscripción push debe usar https');
    await this.subscriptions.save({ userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.subscriptions.remove(userId, endpoint);
  }

  /** Aviso de prueba a los dispositivos de la persona: dice cuántos lo recibieron el servicio push y cuántos no. */
  async test(userId: string): Promise<{ devices: number; sent: number; expired: number; failed: number }> {
    const targets = await this.subscriptions.listForUsers([userId]);
    const payload = { title: 'Parla', body: 'Notificación de prueba: si la ves, los avisos funcionan en este dispositivo.', url: '/app', tag: 'prueba' };
    const results = await Promise.all(
      targets.map(async (target) => {
        const result = await this.sender.send(target, payload);
        if (result === 'gone') await this.subscriptions.removeByEndpoint(target.endpoint);
        return result;
      }),
    );
    return {
      devices: targets.length,
      sent: results.filter((r) => r === 'sent').length,
      expired: results.filter((r) => r === 'gone').length,
      failed: results.filter((r) => r === 'failed').length,
    };
  }

  async status(userId: string): Promise<{ devices: number }> {
    return { devices: await this.subscriptions.countForUser(userId) };
  }
}
