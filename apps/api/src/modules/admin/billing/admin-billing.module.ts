import { Module } from '@nestjs/common';
import { BillingEngineModule } from '../../platform/billing/billing-engine.module';
import { AdminBillingController } from './admin-billing.controller';

@Module({
  imports: [BillingEngineModule],
  controllers: [AdminBillingController],
})
export class AdminBillingModule {}
