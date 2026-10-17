import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { PushEngineModule } from '../messaging/push/push-engine.module';
import { BUSINESSES_REPOSITORY } from './businesses.repository';
import { DRIVERS_REPOSITORY } from './drivers.repository';
import { ORDERS_REPOSITORY } from './orders.repository';
import { PrismaBusinessesRepository } from './prisma-businesses.repository';
import { PrismaDriversRepository } from './prisma-drivers.repository';
import { PrismaOrdersRepository } from './prisma-orders.repository';
import {
  DecideBusinessOrderUseCase,
  GetBusinessOrderUseCase,
  GetMyBusinessUseCase,
  GetOrderContactUseCase,
  ListBusinessOrdersUseCase,
} from './use-cases/business-orders.use-cases';
import {
  AcceptDeliveryUseCase,
  DeliverOrderUseCase,
  GetDriverOrderUseCase,
  GetMyDriverUseCase,
  ListDriverOrdersUseCase,
} from './use-cases/driver-orders.use-cases';
import {
  CreateOrderUseCase,
  GetInternalOrderUseCase,
  GetMyOrderUseCase,
  ListMyOrdersUseCase,
  OrderEvents,
  UpdateOrderUseCase,
} from './use-cases/orders.use-cases';

const USE_CASES = [
  CreateOrderUseCase,
  GetInternalOrderUseCase,
  UpdateOrderUseCase,
  ListMyOrdersUseCase,
  GetMyOrderUseCase,
  GetMyBusinessUseCase,
  ListBusinessOrdersUseCase,
  GetBusinessOrderUseCase,
  DecideBusinessOrderUseCase,
  GetOrderContactUseCase,
  GetMyDriverUseCase,
  ListDriverOrdersUseCase,
  GetDriverOrderUseCase,
  AcceptDeliveryUseCase,
  DeliverOrderUseCase,
];

/** El MOTOR de pedidos de Servicios: lo comparten la puerta del gateway, la del cliente, la del negocio y la del repartidor. */
@Module({
  imports: [AuthModule, PushEngineModule],
  providers: [
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
    { provide: BUSINESSES_REPOSITORY, useClass: PrismaBusinessesRepository },
    { provide: DRIVERS_REPOSITORY, useClass: PrismaDriversRepository },
    OrderEvents,
    ...USE_CASES,
  ],
  exports: USE_CASES,
})
export class OrdersEngineModule {}
