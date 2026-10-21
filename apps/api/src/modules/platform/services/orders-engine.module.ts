import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { PushEngineModule } from '../messaging/push/push-engine.module';
import { BUSINESSES_REPOSITORY } from './businesses.repository';
import { CLAIMS_REPOSITORY } from './claims.repository';
import { ADDRESSES_REPOSITORY } from './addresses.repository';
import { COUPONS_REPOSITORY } from './coupons.repository';
import { PrismaAddressesRepository } from './prisma-addresses.repository';
import { STREET_ROUTER } from '../../../infra/routing/street-router.port';
import { OsrmStreetRouter } from '../../../infra/routing/osrm-street-router.adapter';
import { DELIVERY_SETTINGS_REPOSITORY } from './delivery-settings.repository';
import { PEOPLE_ADMIN_REPOSITORY } from './people-admin.repository';
import { PrismaDeliverySettingsRepository } from './prisma-delivery-settings.repository';
import { PrismaPeopleAdminRepository } from './prisma-people-admin.repository';
import { GetTrafficUseCase, ListPeopleUseCase, SetPersonBlockedUseCase } from './use-cases/admin-people.use-cases';
import {
  DriverRoutePlanUseCase,
  DriverRoutesHistoryUseCase,
  GetDeliverySettingsUseCase,
  QuoteDeliveryUseCase,
  SimulateDeliveryQuoteUseCase,
  UpdateDeliverySettingsUseCase,
} from './use-cases/logistics.use-cases';
import { PrismaCouponsRepository } from './prisma-coupons.repository';
import { DeleteAddressUseCase, LabelAddressUseCase, ListMyAddressesUseCase } from './use-cases/addresses.use-cases';
import { GetAdminOrderUseCase, IsAdminUseCase, ListAdminOrdersUseCase } from './use-cases/admin-orders.use-cases';
import { CreateCouponUseCase, ListCouponsUseCase, QuoteCouponUseCase, SetCouponActiveUseCase } from './use-cases/coupons.use-cases';
import { DispatchPolicy } from './dispatch.policy';
import { DRIVER_LEDGER_REPOSITORY } from './driver-ledger.repository';
import { PHOTOS_REPOSITORY } from './photos.repository';
import { PrismaClaimsRepository } from './prisma-claims.repository';
import { PrismaPhotosRepository } from './prisma-photos.repository';
import { GetDriverDocumentUseCase, ListDriversForReviewUseCase, ReviewDriverUseCase } from './use-cases/admin-drivers.use-cases';
import {
  CreateClaimUseCase,
  GetAdminClaimUseCase,
  ListAdminClaimsUseCase,
  RejectClaimUseCase,
  ReserveClaimRefundUseCase,
  SettleClaimRefundUseCase,
} from './use-cases/claims.use-cases';
import { GetOrderPhotoUseCase, ReadPhotoUseCase, UploadPhotoUseCase } from './use-cases/photos.use-cases';
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
  SetDriverDocumentUseCase,
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
  ListMyAddressesUseCase,
  LabelAddressUseCase,
  DeleteAddressUseCase,
  ListAdminOrdersUseCase,
  GetAdminOrderUseCase,
  IsAdminUseCase,
  QuoteCouponUseCase,
  ListCouponsUseCase,
  CreateCouponUseCase,
  SetCouponActiveUseCase,
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
  SetDriverDocumentUseCase,
  UploadPhotoUseCase,
  ReadPhotoUseCase,
  GetOrderPhotoUseCase,
  ListDriversForReviewUseCase,
  ReviewDriverUseCase,
  GetDriverDocumentUseCase,
  CreateClaimUseCase,
  ListAdminClaimsUseCase,
  GetAdminClaimUseCase,
  RejectClaimUseCase,
  ReserveClaimRefundUseCase,
  SettleClaimRefundUseCase,
  QuoteDeliveryUseCase,
  GetDeliverySettingsUseCase,
  UpdateDeliverySettingsUseCase,
  SimulateDeliveryQuoteUseCase,
  DriverRoutePlanUseCase,
  DriverRoutesHistoryUseCase,
  ListPeopleUseCase,
  SetPersonBlockedUseCase,
  GetTrafficUseCase,
];

/** El MOTOR de pedidos de Servicios: lo comparten la puerta del gateway, la del cliente, la del negocio y la del repartidor. */
@Module({
  imports: [AuthModule, PushEngineModule],
  providers: [
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
    { provide: BUSINESSES_REPOSITORY, useClass: PrismaBusinessesRepository },
    { provide: DRIVERS_REPOSITORY, useClass: PrismaDriversRepository },
    { provide: DRIVER_LEDGER_REPOSITORY, useClass: PrismaDriverLedgerRepository },
    { provide: CLAIMS_REPOSITORY, useClass: PrismaClaimsRepository },
    { provide: PHOTOS_REPOSITORY, useClass: PrismaPhotosRepository },
    { provide: COUPONS_REPOSITORY, useClass: PrismaCouponsRepository },
    { provide: ADDRESSES_REPOSITORY, useClass: PrismaAddressesRepository },
    { provide: DELIVERY_SETTINGS_REPOSITORY, useClass: PrismaDeliverySettingsRepository },
    { provide: PEOPLE_ADMIN_REPOSITORY, useClass: PrismaPeopleAdminRepository },
    { provide: STREET_ROUTER, useClass: OsrmStreetRouter },
    DriverPayPolicy,
    DispatchPolicy,
    OrderEvents,
    WatchDeliveriesUseCase,
    DeliveryWatchService,
    ...USE_CASES,
  ],
  exports: USE_CASES,
})
export class OrdersEngineModule {}
