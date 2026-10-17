import { Module } from '@nestjs/common';
import { InternalBusinessesController } from './internal-businesses.controller';
import { OrdersEngineModule } from './orders-engine.module';
import { ServicesBridgeController } from './services-bridge.controller';

/** Puente entre el gateway (orquestador de Servicios) y el core: rutas /api/internal/orders y /businesses. */
@Module({
  imports: [OrdersEngineModule],
  controllers: [ServicesBridgeController, InternalBusinessesController],
})
export class ServicesBridgeModule {}
