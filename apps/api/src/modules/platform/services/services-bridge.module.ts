import { Module } from '@nestjs/common';
import { InternalBusinessesController } from './internal-businesses.controller';
import { InternalClaimsController } from './internal-claims.controller';
import { InternalCouponsController } from './internal-coupons.controller';
import { InternalDeliveryController } from './internal-delivery.controller';
import { InternalIntegrationsController } from '../stores/internal-integrations.controller';
import { InternalStoreApiController } from '../stores/internal-store-api.controller';
import { StoresEngineModule } from '../stores/stores-engine.module';
import { InternalPayoutsController } from './internal-payouts.controller';
import { OrdersEngineModule } from './orders-engine.module';
import { ServicesBridgeController } from './services-bridge.controller';

/** Puente entre el gateway (orquestador de Servicios) y el core: rutas /api/internal/orders, /businesses y los depósitos de los repartidores. */
@Module({
  imports: [OrdersEngineModule, StoresEngineModule],
  controllers: [ServicesBridgeController, InternalBusinessesController, InternalPayoutsController, InternalClaimsController, InternalCouponsController, InternalDeliveryController, InternalIntegrationsController, InternalStoreApiController],
})
export class ServicesBridgeModule {}
