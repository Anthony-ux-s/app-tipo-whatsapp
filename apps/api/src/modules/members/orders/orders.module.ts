import { Module } from '@nestjs/common';
import { OrdersEngineModule } from '../../platform/services/orders-engine.module';
import { OrdersController } from './orders.controller';

@Module({
  imports: [OrdersEngineModule],
  controllers: [OrdersController],
})
export class OrdersModule {}
