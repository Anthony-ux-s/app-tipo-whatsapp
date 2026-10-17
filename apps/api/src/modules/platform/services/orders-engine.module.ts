import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { PushEngineModule } from '../messaging/push/push-engine.module';
import { ORDERS_REPOSITORY } from './orders.repository';
import { PrismaOrdersRepository } from './prisma-orders.repository';
import {
  CreateOrderUseCase,
  GetInternalOrderUseCase,
  GetMyOrderUseCase,
  ListMyOrdersUseCase,
  OrderEvents,
  UpdateOrderUseCase,
} from './use-cases/orders.use-cases';

const USE_CASES = [CreateOrderUseCase, GetInternalOrderUseCase, UpdateOrderUseCase, ListMyOrdersUseCase, GetMyOrderUseCase];

/** El MOTOR de pedidos de Servicios: lo comparten la puerta del gateway y la de cada cliente. */
@Module({
  imports: [AuthModule, PushEngineModule],
  providers: [{ provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository }, OrderEvents, ...USE_CASES],
  exports: USE_CASES,
})
export class OrdersEngineModule {}
