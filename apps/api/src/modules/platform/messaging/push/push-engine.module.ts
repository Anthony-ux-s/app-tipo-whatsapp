import { Module } from '@nestjs/common';
import { PrismaPushSubscriptionsRepository } from './prisma-push-subscriptions.repository';
import { PUSH_SUBSCRIPTIONS_REPOSITORY } from './push-subscriptions.repository';
import { ManageSubscriptionUseCase } from './use-cases/manage-subscription.use-case';
import { NotificationDispatcher } from './use-cases/notification-dispatcher';

/** El MOTOR de notificaciones push: suscripciones y despacho, sin rutas. */
@Module({
  providers: [
    { provide: PUSH_SUBSCRIPTIONS_REPOSITORY, useClass: PrismaPushSubscriptionsRepository },
    NotificationDispatcher,
    ManageSubscriptionUseCase,
  ],
  exports: [NotificationDispatcher, ManageSubscriptionUseCase],
})
export class PushEngineModule {}
