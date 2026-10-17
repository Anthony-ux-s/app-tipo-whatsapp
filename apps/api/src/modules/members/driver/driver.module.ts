import { Module } from '@nestjs/common';
import { OrdersEngineModule } from '../../platform/services/orders-engine.module';
import { DriverController } from './driver.controller';

@Module({
  imports: [OrdersEngineModule],
  controllers: [DriverController],
})
export class DriverModule {}
