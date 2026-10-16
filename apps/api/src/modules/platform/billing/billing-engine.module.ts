import { Module } from '@nestjs/common';
import { WorkspacesEngineModule } from '../workspaces/workspaces-engine.module';
import { PAYMENTS_REPOSITORY } from './payments.repository';
import { PrismaPaymentsRepository } from './prisma-payments.repository';
import {
  GetBillingOverviewUseCase,
  HandlePaymentWebhookUseCase,
  ListPlansUseCase,
  SandboxCheckoutUseCase,
  SettlePaymentUseCase,
  StartCheckoutUseCase,
} from './use-cases/billing.use-cases';

const USE_CASES = [
  ListPlansUseCase,
  GetBillingOverviewUseCase,
  StartCheckoutUseCase,
  SettlePaymentUseCase,
  HandlePaymentWebhookUseCase,
  SandboxCheckoutUseCase,
];

/** El MOTOR de planes y pagos: catálogo, cobro y activación del plan. */
@Module({
  imports: [WorkspacesEngineModule],
  providers: [{ provide: PAYMENTS_REPOSITORY, useClass: PrismaPaymentsRepository }, ...USE_CASES],
  exports: USE_CASES,
})
export class BillingEngineModule {}
