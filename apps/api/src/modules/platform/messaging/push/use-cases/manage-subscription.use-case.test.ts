import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryPushSubscriptions, RecordingPushSender } from '../../../../../testing/in-memory.fakes';
import { ManageSubscriptionUseCase } from './manage-subscription.use-case';

describe('aviso de prueba', () => {
  let subs: InMemoryPushSubscriptions;
  let sender: RecordingPushSender;
  let manage: ManageSubscriptionUseCase;

  beforeEach(() => {
    subs = new InMemoryPushSubscriptions();
    sender = new RecordingPushSender();
    manage = new ManageSubscriptionUseCase(subs, sender);
  });

  it('se envía solo a los dispositivos de quien lo pide y dice cuántos lo recibieron', async () => {
    await subs.save({ userId: 'u1', endpoint: 'https://push.example/a', p256dh: 'k', auth: 'a' });
    await subs.save({ userId: 'u1', endpoint: 'https://push.example/b', p256dh: 'k', auth: 'a' });
    await subs.save({ userId: 'u2', endpoint: 'https://push.example/c', p256dh: 'k', auth: 'a' });
    sender.gone.add('https://push.example/b');
    expect(await manage.test('u1')).toEqual({ devices: 2, sent: 1, expired: 1, failed: 0 });
    expect(sender.sent.map((s) => s.target.endpoint)).toEqual(['https://push.example/a']);
    // La suscripción caducada se borra: ya no hay que reintentarla.
    expect(await manage.status('u1')).toEqual({ devices: 1 });
  });

  it('sin dispositivos registrados no envía nada', async () => {
    expect(await manage.test('u1')).toEqual({ devices: 0, sent: 0, expired: 0, failed: 0 });
  });
});
