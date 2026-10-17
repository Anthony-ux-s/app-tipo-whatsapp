import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { PushEngineModule } from '../messaging/push/push-engine.module';
import { BUSINESSES_REPOSITORY } from './businesses.repository';
import { DRIVER_LEDGER_REPOSITORY } from './driver-ledger.repository';
import { DriverPayPolicy } from './driver-pay.policy';
import { DRIVERS_REPOSITORY } from './drivers.repository';
import { PrismaDriverLedgerRepository } from './prisma-driver-ledger.repository';
import { ORDERS_REPOSITORY } from './orders.repository';
import { PrismaBusinessesRepository } from './prisma-businesses.repository';
import { PrismaDriversRepository } from './prisma-drivers.repository';
import { PrismaOrdersRepository } from './prisma-orders.repository';
import {
  DecideBusinessOrderUseCase,
  GetBusinessOrderUseCase,
  GetBusinessStatusUseCase,
  GetInternalBusinessUseCase,
  GetMyBusinessUseCase,
  GetOrderContactUseCase,
  ListBusinessOrdersUseCase,
  UpdateMyBusinessUseCase,
} from './use-cases/business-orders.use-cases';
import {
  AcceptDeliveryUseCase,
  DeliverOrderUseCase,
  GetDriverOrderUseCase,
  GetMyDriverUseCase,
  ListDriverOrdersUseCase,
  ReleaseDeliveryUseCase,
} from './use-cases/driver-orders.use-cases';
import {
  GetDriverEarningsUseCase,
  LeaveDriverUseCase,
  RegisterDriverUseCase,
  ReportDriverLocationUseCase,
  SetDriverOnlineUseCase,
  UpdateDriverProfileUseCase,
} from './use-cases/driver-profile.use-cases';
import {
  CreateOrderUseCase,
  GetInternalOrderUseCase,
  GetMyOrderUseCase,
  ListMyOrdersUseCase,
  OrderEvents,
  RateOrderUseCase,
  RenewDeliveryCodeUseCase,
  UpdateOrderUseCase,
} from './use-cases/orders.use-cases';
import { DeliveryWatchService, WatchDeliveriesUseCase } from './use-cases/delivery-watch.use-cases';
import {
  DuePayoutsUseCase,
  GetDriverWalletUseCase,
  ReservePayoutUseCase,
  SetPayoutPhoneUseCase,
  SettlePayoutUseCase,
  StuckPayoutsUseCase,
} from './use-cases/driver-wallet.use-cases';

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
  UpdateMyBusinessUseCase,
  GetBusinessStatusUseCase,
  GetInternalBusinessUseCase,
  GetMyDriverUseCase,
  ListDriverOrdersUseCase,
  GetDriverOrderUseCase,
  AcceptDeliveryUseCase,
  DeliverOrderUseCase,
  ReleaseDeliveryUseCase,
  RenewDeliveryCodeUseCase,
  RegisterDriverUseCase,
  UpdateDriverProfileUseCase,
  SetDriverOnlineUseCase,
  LeaveDriverUseCase,
  GetDriverEarningsUseCase,
  ReportDriverLocationUseCase,
  RateOrderUseCase,
  GetDriverWalletUseCase,
  SetPayoutPhoneUseCase,
  ReservePayoutUseCase,
  SettlePayoutUseCase,
  DuePayoutsUseCase,
  StuckPayoutsUseCase,
];

/** El MOTOR de pedidos de Servicios: lo comparten la puerta del gateway, la del cliente, la del negocio y la del repartidor. */
@Module({
  imports: [AuthModule, PushEngineModule],
  providers: [
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
    { provide: BUSINESSES_REPOSITORY, useClass: PrismaBusinessesRepository },
    { provide: DRIVERS_REPOSITORY, useClass: PrismaDriversRepository },
    { provide: DRIVER_LEDGER_REPOSITORY, useClass: PrismaDriverLedgerRepository },
    DriverPayPolicy,
    OrderEvents,
    WatchDeliveriesUseCase,
    DeliveryWatchService,
    ...USE_CASES,
  ],
  exports: USE_CASES,
})
export class OrdersEngineModule {}
