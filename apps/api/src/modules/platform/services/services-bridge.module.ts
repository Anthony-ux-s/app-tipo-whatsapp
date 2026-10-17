import { Module } from '@nestjs/common';
import { InternalBusinessesController } from './internal-businesses.controller';
import { InternalPayoutsController } from './internal-payouts.controller';
import { OrdersEngineModule } from './orders-engine.module';
import { ServicesBridgeController } from './services-bridge.controller';

/** Puente entre el gateway (orquestador de Servicios) y el core: rutas /api/internal/orders, /businesses y los depósitos de los repartidores. */
@Module({
  imports: [OrdersEngineModule],
  controllers: [ServicesBridgeController, InternalBusinessesController, InternalPayoutsController],
})
export class ServicesBridgeModule {}
