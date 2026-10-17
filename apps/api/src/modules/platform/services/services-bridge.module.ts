import { Module } from '@nestjs/common';
import { OrdersEngineModule } from './orders-engine.module';
import { ServicesBridgeController } from './services-bridge.controller';

/** Puente entre el gateway (orquestador de Servicios) y el core: rutas /api/internal/orders. */
@Module({
  imports: [OrdersEngineModule],
  controllers: [ServicesBridgeController],
})
export class ServicesBridgeModule {}
