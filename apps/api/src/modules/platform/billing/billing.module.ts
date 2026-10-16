import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingEngineModule } from './billing-engine.module';

@Module({
  imports: [BillingEngineModule],
  controllers: [BillingController],
})
export class BillingModule {}
