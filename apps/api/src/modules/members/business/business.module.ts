import { Module } from '@nestjs/common';
import { OrdersEngineModule } from '../../platform/services/orders-engine.module';
import { BusinessController } from './business.controller';

@Module({
  imports: [OrdersEngineModule],
  controllers: [BusinessController],
})
export class BusinessModule {}
