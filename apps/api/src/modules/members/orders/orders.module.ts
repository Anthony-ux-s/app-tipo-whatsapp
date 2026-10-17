import { Module } from '@nestjs/common';
import { OrdersEngineModule } from '../../platform/services/orders-engine.module';
import { AddressesController } from './addresses.controller';
import { OrdersController } from './orders.controller';

@Module({
  imports: [OrdersEngineModule],
  controllers: [OrdersController, AddressesController],
})
export class OrdersModule {}
